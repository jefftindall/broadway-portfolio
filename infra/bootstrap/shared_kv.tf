# Shared foundation Key Vault — site-build, Turnstile, ACS (email/SMS), and ops
# ALERT-* contacts identical across staging and prod. Env vaults keep Gemini /
# GitHub App / allowlist / AAD.

locals {
  shared_kv_name = "kv-elyse-shared"
  shared_rg_name = "rg-elyse-shared"
  shared_tags = merge(var.tags, {
    purpose = "shared-foundation"
  })
}

resource "azurerm_resource_group" "shared" {
  name     = local.shared_rg_name
  location = var.location
  tags     = local.shared_tags
}

resource "azurerm_key_vault" "shared" {
  name                       = local.shared_kv_name
  location                   = azurerm_resource_group.shared.location
  resource_group_name        = azurerm_resource_group.shared.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
  rbac_authorization_enabled = true
  tags                       = local.shared_tags
}

resource "azurerm_role_assignment" "shared_kv_admin" {
  scope                = azurerm_key_vault.shared.id
  role_definition_name = "Key Vault Administrator"
  principal_id         = data.azurerm_client_config.current.object_id

  lifecycle {
    ignore_changes = [principal_id]
  }
}

# Identical across staging + prod (single Astro build embeds these).
resource "azurerm_key_vault_secret" "site_contact_email" {
  name         = "SITE-CONTACT-EMAIL"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "site_contact_phone" {
  name         = "SITE-CONTACT-PHONE"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "site_date_of_birth" {
  name         = "SITE-DATE-OF-BIRTH"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "turnstile_site_key" {
  name         = "TURNSTILE-SITE-KEY"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "turnstile_secret_key" {
  name         = "TURNSTILE-SECRET-KEY"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

# Ops / Azure Monitor Action Group contacts (OPS-P0-002). Not used by SWA or Astro
# build — env stacks read these at apply under OPS-P1-*. Keep separate from SITE-CONTACT-*.
resource "azurerm_key_vault_secret" "alert_email" {
  name         = "ALERT-EMAIL"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "alert_sms_phone" {
  name         = "ALERT-SMS-PHONE"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "alert_voice_phone" {
  name         = "ALERT-VOICE-PHONE"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

# Repo-level var so Build release / CI do not depend on a per-environment vault.
resource "github_actions_variable" "azure_shared_key_vault_name" {
  count         = var.manage_github_actions ? 1 : 0
  repository    = var.github_repo
  variable_name = "AZURE_SHARED_KEY_VAULT_NAME"
  value         = azurerm_key_vault.shared.name
}

# Build release uses the prod deploy identity; staging-branch uses staging.
# Grant both here so CD is not blocked waiting for the other env’s Terraform apply.
data "azuread_service_principal" "gha_staging" {
  display_name = "elyse-portfolio-gha-staging"
}

data "azuread_service_principal" "gha_prod" {
  display_name = "elyse-portfolio-gha-prod"
}

resource "azurerm_role_assignment" "shared_kv_gha_staging" {
  scope                = azurerm_key_vault.shared.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = data.azuread_service_principal.gha_staging.object_id
}

resource "azurerm_role_assignment" "shared_kv_gha_prod" {
  scope                = azurerm_key_vault.shared.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = data.azuread_service_principal.gha_prod.object_id
}
