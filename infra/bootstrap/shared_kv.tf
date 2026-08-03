# Shared foundation Key Vault — site-build + cross-env identical secrets.
# Staging/prod env vaults keep environment-specific API secrets (ACS, Gemini, etc.).

locals {
  shared_kv_name = "kv-elyse-shared"
  shared_rg_name = "rg-elyse-shared"
  shared_tags = merge(var.tags, {
    purpose = "shared-site-secrets"
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

# Repo-level var so Build release / CI do not depend on a per-environment vault.
resource "github_actions_variable" "azure_shared_key_vault_name" {
  count         = var.manage_github_actions ? 1 : 0
  repository    = var.github_repo
  variable_name = "AZURE_SHARED_KEY_VAULT_NAME"
  value         = azurerm_key_vault.shared.name
}
