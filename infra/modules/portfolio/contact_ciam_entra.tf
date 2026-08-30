# Per-environment OIDC app registration in the shared CIAM tenant (ACCOUNT-P1-001).
# Requires bootstrap CONTACT-CIAM-TENANT-ID in kv-elyse-shared and Terraform OIDC
# principal granted Application Administrator on that tenant (see runbook).

locals {
  contact_auth_callback_path = "/.auth/login/contact/callback"
  contact_redirect_uris = [
    for host in local.auth_hostnames : "https://${host}${local.contact_auth_callback_path}"
  ]
  contact_ciam_tenant_id = trimspace(data.azurerm_key_vault_secret.contact_ciam_tenant_id.value)
  contact_ciam_ready = (
    var.manage_contact_oidc_app &&
    local.contact_ciam_tenant_id != "" &&
    local.contact_ciam_tenant_id != "REPLACE_ME" &&
    can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", local.contact_ciam_tenant_id))
  )
  contact_oidc_issuer = trimspace(data.azurerm_key_vault_secret.contact_ciam_oidc_issuer.value)
}

data "azurerm_key_vault_secret" "contact_ciam_tenant_id" {
  name         = "CONTACT-CIAM-TENANT-ID"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "contact_ciam_oidc_issuer" {
  name         = "CONTACT-CIAM-OIDC-ISSUER"
  key_vault_id = data.azurerm_key_vault.shared.id
}

resource "azuread_application" "contact_swa" {
  count    = local.contact_ciam_ready ? 1 : 0
  provider = azuread.contact_ciam

  display_name     = "elyse-portfolio-contact-${var.environment}"
  owners           = [data.azuread_client_config.contact_ciam[0].object_id]
  sign_in_audience = "AzureADMyOrg"

  api {
    requested_access_token_version = 2
  }

  web {
    implicit_grant {
      access_token_issuance_enabled = false
      id_token_issuance_enabled     = true
    }
  }

  lifecycle {
    ignore_changes = [owners]
  }
}

resource "azuread_application_redirect_uris" "contact_swa_web" {
  count    = local.contact_ciam_ready ? 1 : 0
  provider = azuread.contact_ciam

  application_id = azuread_application.contact_swa[0].id
  type           = "Web"
  redirect_uris  = local.contact_redirect_uris
}

resource "time_rotating" "contact_oidc_secret" {
  count = local.contact_ciam_ready ? 1 : 0

  rotation_days = var.entra_secret_rotation_days
}

resource "azuread_application_password" "contact_swa" {
  count    = local.contact_ciam_ready ? 1 : 0
  provider = azuread.contact_ciam

  application_id = azuread_application.contact_swa[0].id
  display_name   = "swa-contact-oidc-${var.environment}"
  end_date       = timeadd(time_rotating.contact_oidc_secret[0].rfc3339, var.entra_secret_lifetime)

  rotate_when_changed = {
    rotation = time_rotating.contact_oidc_secret[0].id
  }
}

resource "azurerm_key_vault_secret" "contact_oidc_client_id" {
  name         = "CONTACT-OIDC-CLIENT-ID"
  value        = local.contact_ciam_ready ? azuread_application.contact_swa[0].client_id : "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]
}

resource "azurerm_key_vault_secret" "contact_oidc_client_secret" {
  name         = "CONTACT-OIDC-CLIENT-SECRET"
  value        = local.contact_ciam_ready ? azuread_application_password.contact_swa[0].value : "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [tags]
  }
}

resource "azurerm_key_vault_secret" "contact_ciam_oidc_issuer_env" {
  name         = "CONTACT-CIAM-OIDC-ISSUER"
  value        = local.contact_oidc_issuer != "" && local.contact_oidc_issuer != "REPLACE_ME" ? local.contact_oidc_issuer : "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

data "azuread_client_config" "contact_ciam" {
  count    = local.contact_ciam_ready ? 1 : 0
  provider = azuread.contact_ciam
}

data "azurerm_key_vault_secret" "contact_oidc_client_id" {
  name         = azurerm_key_vault_secret.contact_oidc_client_id.name
  key_vault_id = azurerm_key_vault.main.id
}
