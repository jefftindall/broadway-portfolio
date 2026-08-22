# Stripe lesson payments. Keys, webhook signing secrets, and Payment Links live
# in bootstrap kv-elyse-shared (TEST vs LIVE). This environment stack only
# data-sources them — it does not create Stripe resources or feed bootstrap.
# See docs/runbooks/rotate-secrets.md and docs/plans/lesson-payments.md.

locals {
  lesson_payments_enabled_setting = var.lesson_payments_enabled ? "true" : "false"
  stripe_mode_prefix              = var.environment == "prod" ? "STRIPE-LIVE" : "STRIPE-TEST"
}

data "azurerm_key_vault_secret" "stripe_secret_key" {
  name         = "${local.stripe_mode_prefix}-SECRET-KEY"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "stripe_publishable_key" {
  name         = "${local.stripe_mode_prefix}-PUBLISHABLE-KEY"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "stripe_webhook_secret" {
  name         = "${local.stripe_mode_prefix}-WEBHOOK-SECRET"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "stripe_payment_link_30min" {
  name         = "${local.stripe_mode_prefix}-PAYMENT-LINK-30MIN"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "stripe_payment_link_60min" {
  name         = "${local.stripe_mode_prefix}-PAYMENT-LINK-60MIN"
  key_vault_id = data.azurerm_key_vault.shared.id
}
