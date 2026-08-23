# Stripe API keys only. Staging/prod initialize the Stripe provider from these
# secrets and own the catalog (products, prices, webhooks, Payment Links).
# Do not data-source env vaults or env Terraform state from this stack.

resource "azurerm_key_vault_secret" "stripe_test_secret" {
  name         = "STRIPE-TEST-SECRET-KEY"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "stripe_test_publishable" {
  name         = "STRIPE-TEST-PUBLISHABLE-KEY"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "stripe_live_secret" {
  name         = "STRIPE-LIVE-SECRET-KEY"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "stripe_live_publishable" {
  name         = "STRIPE-LIVE-PUBLISHABLE-KEY"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}
