data "azuread_client_config" "current" {}

locals {
  # SWA custom authentication callback path for the "aad" provider
  auth_callback_path = "/.auth/login/aad/callback"

  # Hostnames that must be able to complete an Entra sign-in:
  # the Azure-generated SWA hostname plus any custom domains for this environment.
  auth_hostnames = distinct(concat(
    [azurerm_static_web_app.main.default_host_name],
    var.custom_domain == "" ? [] : [var.custom_domain],
    var.additional_auth_hostnames,
  ))

  redirect_uris = [
    for host in local.auth_hostnames : "https://${host}${local.auth_callback_path}"
  ]
}

resource "azuread_application" "swa" {
  display_name     = "elyse-portfolio-${var.environment}"
  owners           = [data.azuread_client_config.current.object_id]
  sign_in_audience = "AzureADMyOrg"

  web {
    implicit_grant {
      access_token_issuance_enabled = false
      id_token_issuance_enabled     = true
    }
  }

  required_resource_access {
    # Microsoft Graph
    resource_app_id = "00000003-0000-0000-c000-000000000000"

    resource_access {
      # User.Read (delegated)
      id   = "e1fe6dd8-ba31-4d61-89e7-88639da4683d"
      type = "Scope"
    }
  }

  lifecycle {
    # Redirect URIs are managed by azuread_application_redirect_uris below,
    # which depends on the Static Web App hostname.
    # Owners: avoid thrashing between local users and the Terraform OIDC principal.
    ignore_changes = [web[0].redirect_uris, owners]
  }
}

# Managed separately so the Static Web App can consume the client ID without a dependency cycle.
resource "azuread_application_redirect_uris" "swa_web" {
  application_id = azuread_application.swa.id
  type           = "Web"
  redirect_uris  = local.redirect_uris
}

resource "azuread_service_principal" "swa" {
  client_id                    = azuread_application.swa.client_id
  app_role_assignment_required = var.require_app_role_assignment
  owners                       = [data.azuread_client_config.current.object_id]

  lifecycle {
    ignore_changes = [owners]
  }
}

# Anchors the secret's end_date so it stays stable between plans, and triggers
# a new secret once the rotation window elapses.
resource "time_rotating" "entra_secret" {
  rotation_days = var.entra_secret_rotation_days
}

resource "azuread_application_password" "swa" {
  application_id = azuread_application.swa.id
  display_name   = "swa-auth-${var.environment}"
  end_date       = timeadd(time_rotating.entra_secret.rfc3339, var.entra_secret_lifetime)

  rotate_when_changed = {
    rotation = time_rotating.entra_secret.id
  }
}

resource "azurerm_key_vault_secret" "aad_client_secret" {
  name         = "AAD-CLIENT-SECRET"
  value        = azuread_application_password.swa.value
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]
}
