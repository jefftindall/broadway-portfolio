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

  # Staging Studio isolates publishes on dated branches + PRs; prod commits to github_branch.
  studio_publish_mode = var.studio_publish_mode != "" ? var.studio_publish_mode : (
    var.environment == "staging" ? "pr" : "direct"
  )

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
  name                = local.kv_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"
  # OPS-P3-006 — prod enables purge protection + longer soft-delete; staging keeps defaults.
  soft_delete_retention_days = var.soft_delete_retention_days
  purge_protection_enabled   = var.purge_protection_enabled
  rbac_authorization_enabled = true
  tags                       = local.tags
}

resource "azurerm_role_assignment" "kv_admin" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Administrator"
  principal_id         = data.azurerm_client_config.current.object_id

  # Whoever first applied (usually a human) keeps admin; CI uses the Terraform
  # OIDC principal granted Key Vault Secrets Officer at subscription scope in bootstrap.
  lifecycle {
    ignore_changes = [principal_id]
  }
}

# Placeholder secrets (values set outside Terraform). ignore_changes keeps REPLACE_ME
# out of the live vault after the first apply; data sources below read current values.
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

# Managed Functions do not resolve @Microsoft.KeyVault(...) app settings — they
# receive the literal reference string. Read live vault values at plan/apply and
# write them into SWA configuration. Key Vault remains the source of truth;
# terraform apply (or scripts/sync-swa-api-secrets.sh) syncs into SWA.
# AAD_CLIENT_SECRET stays a Key Vault reference — SWA auth platform resolves it.
# SITE-CONTACT-* / Turnstile live in bootstrap kv-elyse-shared (see shared_kv.tf).
data "azurerm_key_vault_secret" "gemini" {
  name         = azurerm_key_vault_secret.gemini.name
  key_vault_id = azurerm_key_vault.main.id
}

data "azurerm_key_vault_secret" "github_app_id" {
  name         = azurerm_key_vault_secret.github_app_id.name
  key_vault_id = azurerm_key_vault.main.id
}

data "azurerm_key_vault_secret" "github_app_installation_id" {
  name         = azurerm_key_vault_secret.github_app_installation_id.name
  key_vault_id = azurerm_key_vault.main.id
}

data "azurerm_key_vault_secret" "github_app_private_key" {
  name         = azurerm_key_vault_secret.github_app_private_key.name
  key_vault_id = azurerm_key_vault.main.id
}

data "azurerm_key_vault_secret" "allowlist" {
  name         = azurerm_key_vault_secret.allowlist.name
  key_vault_id = azurerm_key_vault.main.id
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
    GEMINI_API_KEY                        = data.azurerm_key_vault_secret.gemini.value
    GEMINI_MODEL                          = var.gemini_model
    GITHUB_APP_ID                         = data.azurerm_key_vault_secret.github_app_id.value
    GITHUB_APP_INSTALLATION_ID            = data.azurerm_key_vault_secret.github_app_installation_id.value
    GITHUB_APP_PRIVATE_KEY                = data.azurerm_key_vault_secret.github_app_private_key.value
    ALLOWED_USER_IDS                      = data.azurerm_key_vault_secret.allowlist.value
    AAD_CLIENT_SECRET                     = "@Microsoft.KeyVault(SecretUri=${azurerm_key_vault.main.vault_uri}secrets/AAD-CLIENT-SECRET/)"
    AAD_CLIENT_ID                         = azuread_application.swa.client_id
    AAD_TENANT_ID                         = data.azurerm_client_config.current.tenant_id
    GITHUB_OWNER                          = var.github_owner
    GITHUB_REPO                           = var.github_repo
    GITHUB_BRANCH                         = var.github_branch
    STUDIO_PUBLISH_MODE                   = local.studio_publish_mode
    APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.main.connection_string
    # Contact inquiry API (shared ACS; SMS when ACS_SMS_FROM is a real E.164 number)
    ACS_CONNECTION_STRING = data.azurerm_key_vault_secret.acs_connection_string.value
    ACS_EMAIL_SENDER      = data.azurerm_key_vault_secret.acs_email_sender.value
    CONTACT_NOTIFY_EMAIL  = data.azurerm_key_vault_secret.site_contact_email.value
    CONTACT_NOTIFY_PHONE  = data.azurerm_key_vault_secret.site_contact_phone.value
    CONTACT_SMS_ENABLED   = local.contact_sms_enabled
    ACS_SMS_FROM          = data.azurerm_key_vault_secret.acs_sms_from.value
    TURNSTILE_SECRET      = data.azurerm_key_vault_secret.turnstile_secret_key.value
    # Lesson payments (Stripe). Secret/restricted key is server-side only.
    LESSON_PAYMENTS_ENABLED   = local.lesson_payments_enabled_setting
    STRIPE_SECRET_KEY         = data.azurerm_key_vault_secret.stripe_secret_key.value
    STRIPE_PUBLISHABLE_KEY    = data.azurerm_key_vault_secret.stripe_publishable_key.value
    STRIPE_WEBHOOK_SECRET     = data.azurerm_key_vault_secret.stripe_webhook_secret.value
    STRIPE_PAYMENT_LINK_30MIN = data.azurerm_key_vault_secret.stripe_payment_link_30min.value
    STRIPE_PAYMENT_LINK_60MIN = data.azurerm_key_vault_secret.stripe_payment_link_60min.value
  }

  depends_on = [
    azurerm_key_vault_secret.aad_client_secret,
  ]

  lifecycle {
    ignore_changes = [
      repository_url,
      repository_branch,
    ]
  }
}

resource "azurerm_role_assignment" "swa_kv_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_static_web_app.main.identity[0].principal_id
}

resource "azurerm_static_web_app_custom_domain" "apex" {
  count             = var.custom_domain == "" ? 0 : 1
  static_web_app_id = azurerm_static_web_app.main.id
  domain_name       = var.custom_domain
  validation_type   = "dns-txt-token"
}

# www CNAME must already point at the SWA default hostname (Namecheap).
# After apply: Portal → Custom domains → set apex as default so www 301s to apex.
resource "azurerm_static_web_app_custom_domain" "www" {
  count             = var.custom_domain == "" ? 0 : 1
  static_web_app_id = azurerm_static_web_app.main.id
  domain_name       = "www.${var.custom_domain}"
  validation_type   = "cname-delegation"
}

# Subdomains (staging test.elysetindall.com). TXT validation so apply does not
# wait on DNS — unlike cname-delegation, which fails CD until the CNAME exists.
resource "azurerm_static_web_app_custom_domain" "hostname" {
  for_each          = toset(var.custom_hostnames)
  static_web_app_id = azurerm_static_web_app.main.id
  domain_name       = each.value
  validation_type   = "dns-txt-token"

  lifecycle {
    precondition {
      condition     = var.custom_domain == "" || (each.value != var.custom_domain && each.value != "www.${var.custom_domain}")
      error_message = "custom_hostnames must not repeat custom_domain or www.<custom_domain>."
    }
  }
}
