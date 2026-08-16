data "azuread_client_config" "current" {}

data "azuread_domains" "initial" {
  only_initial = true
}

data "azuread_users" "monitor" {
  user_principal_names = [local.monitor_upn]
  ignore_missing       = true
}

locals {
  # SWA custom authentication callback path for the "aad" provider
  auth_callback_path = "/.auth/login/aad/callback"

  monitor_upn = var.monitor_upn != "" ? var.monitor_upn : "studio-monitor@${data.azuread_domains.initial.domains[0].domain_name}"

  # Application app role for post-deploy client_credentials (TEST-C-005). Stable UUID.
  monitor_ping_role_id = "a7c4e8f1-2b3d-4e5f-a6b7-c8d9e0f1a2b3"

  # Delegated scope so user login can be pre-authorized after the app exposes an API.
  # Application-only Monitor.Ping cannot be user-consented ("Need admin approval").
  user_impersonation_scope_id = "4e8f2c1a-9b7d-4a6e-8f3c-1d2e3a4b5c6d"

  # Tenant policy requires app ID, tenant ID, or a verified domain in the URI
  # (api://elyse-portfolio-<env> is rejected). Scope is api://{client-id}/.default.
  monitor_identifier_uri = "api://${azuread_application.swa.client_id}"

  # Hostnames that must be able to complete an Entra sign-in:
  # the Azure-generated SWA hostname plus apex/www custom domains for this environment.
  auth_hostnames = distinct(concat(
    [azurerm_static_web_app.main.default_host_name],
    var.custom_domain == "" ? [] : [var.custom_domain, "www.${var.custom_domain}"],
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

  api {
    requested_access_token_version = 2

    oauth2_permission_scope {
      admin_consent_description  = "Sign in to Studio as the signed-in user."
      admin_consent_display_name = "Access Studio"
      enabled                    = true
      id                         = local.user_impersonation_scope_id
      type                       = "User"
      user_consent_description   = "Sign in to Studio."
      user_consent_display_name  = "Access Studio"
      value                      = "user_impersonation"
    }
  }

  web {
    implicit_grant {
      access_token_issuance_enabled = false
      id_token_issuance_enabled     = true
    }
  }

  app_role {
    allowed_member_types = ["Application"]
    description          = "Client-credentials ping for post-deploy token checks (TEST-C-005)"
    display_name         = "Monitor Ping"
    enabled              = true
    id                   = local.monitor_ping_role_id
    value                = "Monitor.Ping"
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

# Set after create so the URI can include client_id (same-resource self-reference is a cycle).
resource "azuread_application_identifier_uri" "swa" {
  application_id = azuread_application.swa.id
  identifier_uri = local.monitor_identifier_uri
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

# Skip the user consent prompt when Easy Auth requests this app's own API
# (identifier URI + app roles otherwise show "Need admin approval").
resource "azuread_application_pre_authorized" "swa" {
  application_id       = azuread_application.swa.id
  authorized_client_id = azuread_application.swa.client_id
  permission_ids       = [local.user_impersonation_scope_id]
  depends_on           = [azuread_application_identifier_uri.swa]
}

# Default role (0000…) — assignment required, no custom user-facing roles.
# Count is 0 until bootstrap creates the monitor user (ignore_missing).
resource "azuread_app_role_assignment" "monitor" {
  count               = length(data.azuread_users.monitor.object_ids) == 1 ? 1 : 0
  app_role_id         = "00000000-0000-0000-0000-000000000000"
  principal_object_id = data.azuread_users.monitor.object_ids[0]
  resource_object_id  = azuread_service_principal.swa.object_id
}

# Same-app client_credentials needs the SWA SP assigned Monitor.Ping on itself.
resource "azuread_app_role_assignment" "monitor_ping_self" {
  app_role_id         = local.monitor_ping_role_id
  principal_object_id = azuread_service_principal.swa.object_id
  resource_object_id  = azuread_service_principal.swa.object_id
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
