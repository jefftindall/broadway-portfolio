# Stripe (lesson payments). Staging vault holds test-mode values; prod holds live.
# Placeholders stay REPLACE_ME until set via az keyvault secret set (ignore_changes).
# CD ships one Astro artifact to both SWAs, so Payment Links and the public flag
# are runtime SWA app settings — not baked into the client bundle.
# See docs/runbooks/rotate-secrets.md and docs/plans/lesson-payments.md.

locals {
  lesson_payments_enabled_setting = var.lesson_payments_enabled ? "true" : "false"
}

resource "azurerm_key_vault_secret" "stripe_secret_key" {
  name         = "STRIPE-SECRET-KEY"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "stripe_publishable_key" {
  name         = "STRIPE-PUBLISHABLE-KEY"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "stripe_webhook_secret" {
  name         = "STRIPE-WEBHOOK-SECRET"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "stripe_payment_link_30min" {
  name         = "STRIPE-PAYMENT-LINK-30MIN"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_key_vault_secret" "stripe_payment_link_60min" {
  name         = "STRIPE-PAYMENT-LINK-60MIN"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

data "azurerm_key_vault_secret" "stripe_secret_key" {
  name         = azurerm_key_vault_secret.stripe_secret_key.name
  key_vault_id = azurerm_key_vault.main.id
}

data "azurerm_key_vault_secret" "stripe_publishable_key" {
  name         = azurerm_key_vault_secret.stripe_publishable_key.name
  key_vault_id = azurerm_key_vault.main.id
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
