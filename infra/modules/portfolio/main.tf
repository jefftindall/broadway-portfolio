terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.12"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

data "azurerm_client_config" "current" {}

locals {
  # Environment-scoped names — staging and prod never share resource names
  name_suffix = var.environment
  rg_name     = "rg-elyse-portfolio-${local.name_suffix}"
  # Key Vault: 3–24 chars, alphanumeric + hyphens
  kv_name  = "kv-elyse-${local.name_suffix}"
  swa_name = "swa-elyse-portfolio-${local.name_suffix}"

  tags = merge(var.tags, {
    environment = var.environment
    project     = "elyse-tindall-portfolio"
    managed     = "terraform"
  })
}

resource "azurerm_resource_group" "main" {
  name     = local.rg_name
  location = var.location
  tags     = local.tags
}

resource "azurerm_key_vault" "main" {
  name                       = local.kv_name
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
  rbac_authorization_enabled = true
  tags                       = local.tags
}

resource "azurerm_role_assignment" "kv_admin" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Administrator"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_static_web_app" "main" {
  name                = local.swa_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku_tier            = "Standard"
  sku_size            = "Standard"
  tags                = local.tags

  identity {
    type = "SystemAssigned"
  }

  app_settings = {
    GEMINI_API_KEY             = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault.main.vault_uri}secrets/GEMINI-API-KEY/)"
    GITHUB_APP_ID              = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault.main.vault_uri}secrets/GITHUB-APP-ID/)"
    GITHUB_APP_INSTALLATION_ID = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault.main.vault_uri}secrets/GITHUB-APP-INSTALLATION-ID/)"
    GITHUB_APP_PRIVATE_KEY     = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault.main.vault_uri}secrets/GITHUB-APP-PRIVATE-KEY/)"
    ALLOWED_USER_IDS           = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault.main.vault_uri}secrets/ALLOWED-USER-IDS/)"
    AAD_CLIENT_SECRET          = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault.main.vault_uri}secrets/AAD-CLIENT-SECRET/)"
    AAD_CLIENT_ID              = azuread_application.swa.client_id
    AAD_TENANT_ID              = data.azurerm_client_config.current.tenant_id
    GITHUB_OWNER               = var.github_owner
    GITHUB_REPO                = var.github_repo
    GITHUB_BRANCH              = var.github_branch
  }
}

resource "azurerm_role_assignment" "swa_kv_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_static_web_app.main.identity[0].principal_id
}

resource "azurerm_key_vault_secret" "gemini" {
  name         = "GEMINI-API-KEY"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "github_app_id" {
  name         = "GITHUB-APP-ID"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "github_app_installation_id" {
  name         = "GITHUB-APP-INSTALLATION-ID"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "github_app_private_key" {
  name         = "GITHUB-APP-PRIVATE-KEY"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "allowlist" {
  name         = "ALLOWED-USER-IDS"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_static_web_app_custom_domain" "apex" {
  count             = var.custom_domain == "" ? 0 : 1
  static_web_app_id = azurerm_static_web_app.main.id
  domain_name       = var.custom_domain
  validation_type   = "dns-txt-token"
}
