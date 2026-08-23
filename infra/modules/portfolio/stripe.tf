# Lesson-payment catalog for this environment. API keys come from bootstrap
# kv-elyse-shared (TEST on staging, LIVE on prod). Webhook signing secrets and
# Payment Links are stored in this environment's vault so apply can promote
# independently. See docs/runbooks/rotate-secrets.md.

locals {
  lesson_payments_enabled_setting = var.lesson_payments_enabled ? "true" : "false"
  stripe_mode                     = var.environment == "prod" ? "live" : "test"
  stripe_secret_name              = var.environment == "prod" ? "STRIPE-LIVE-SECRET-KEY" : "STRIPE-TEST-SECRET-KEY"
  stripe_publishable_name         = var.environment == "prod" ? "STRIPE-LIVE-PUBLISHABLE-KEY" : "STRIPE-TEST-PUBLISHABLE-KEY"
  stripe_key_regex                = var.environment == "prod" ? "^(sk|rk)_live_" : "^(sk|rk)_test_"
  stripe_public_host = (
    var.environment == "prod"
    ? (var.custom_domain != "" ? var.custom_domain : "elysetindall.com")
    : (length(var.custom_hostnames) > 0 ? var.custom_hostnames[0] : "test.elysetindall.com")
  )
  stripe_webhook_url              = "https://${local.stripe_public_host}/api/stripeWebhook"
  stripe_payment_link_success_url = "https://${local.stripe_public_host}/lessons/book"
  stripe_secret_value             = trimspace(data.azurerm_key_vault_secret.stripe_secret_key.value)
  stripe_ready = (
    local.stripe_secret_value != "REPLACE_ME" &&
    can(regex(local.stripe_key_regex, local.stripe_secret_value))
  )
  lesson_rate_ids = toset(compact(split(",", data.external.lesson_rates.result.ids)))
  lesson_rates = {
    for id in local.lesson_rate_ids : id => {
      label = data.external.lesson_rates.result["${id}_label"]
      cents = tonumber(data.external.lesson_rates.result["${id}_cents"])
    }
  }
}

data "azurerm_key_vault_secret" "stripe_secret_key" {
  name         = local.stripe_secret_name
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "stripe_publishable_key" {
  name         = local.stripe_publishable_name
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "external" "lesson_rates" {
  program = ["node", replace(abspath("${path.module}/../../../scripts/read-lesson-rates.mjs"), "\\", "/")]
}

module "stripe_catalog" {
  count  = local.stripe_ready ? 1 : 0
  source = "../stripe_catalog"

  rates       = local.lesson_rates
  webhook_url = local.stripe_webhook_url
  mode        = local.stripe_mode
}

resource "azurerm_key_vault_secret" "stripe_webhook_secret" {
  name         = "STRIPE-WEBHOOK-SECRET"
  value        = try(module.stripe_catalog[0].webhook_secret, "REPLACE_ME")
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]
}

resource "azurerm_key_vault_secret" "stripe_payment_link_30min" {
  name         = "STRIPE-PAYMENT-LINK-30MIN"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "stripe_payment_link_60min" {
  name         = "STRIPE-PAYMENT-LINK-60MIN"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

data "azurerm_key_vault_secret" "stripe_webhook_secret" {
  name         = azurerm_key_vault_secret.stripe_webhook_secret.name
  key_vault_id = azurerm_key_vault.main.id
}

data "azurerm_key_vault_secret" "stripe_payment_link_30min" {
  name         = azurerm_key_vault_secret.stripe_payment_link_30min.name
  key_vault_id = azurerm_key_vault.main.id
}

data "azurerm_key_vault_secret" "stripe_payment_link_60min" {
  name         = azurerm_key_vault_secret.stripe_payment_link_60min.name
  key_vault_id = azurerm_key_vault.main.id
}

resource "terraform_data" "stripe_payment_links" {
  count = local.stripe_ready ? 1 : 0

  triggers_replace = [
    jsonencode(module.stripe_catalog[0].price_ids),
    local.stripe_payment_link_success_url,
  ]

  provisioner "local-exec" {
    interpreter = ["node"]
    command     = replace(abspath("${path.module}/../../../scripts/upsert-stripe-payment-links.mjs"), "\\", "/")
    working_dir = abspath("${path.module}/../../..")
    environment = {
      STRIPE_MODE                     = local.stripe_mode
      STRIPE_SECRET_VAULT_NAME        = data.azurerm_key_vault.shared.name
      STRIPE_SECRET_NAME              = local.stripe_secret_name
      PAYMENT_LINK_VAULT_NAME         = azurerm_key_vault.main.name
      STRIPE_PRICE_IDS                = jsonencode(module.stripe_catalog[0].price_ids)
      STRIPE_PAYMENT_LINK_SUCCESS_URL = local.stripe_payment_link_success_url
    }
  }

  depends_on = [
    azurerm_key_vault_secret.stripe_payment_link_30min,
    azurerm_key_vault_secret.stripe_payment_link_60min,
  ]
}
