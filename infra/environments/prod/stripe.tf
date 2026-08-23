# Stripe provider for this environment — live-mode key from bootstrap shared KV.
# Catalog is applied here after staging has validated the same Terraform.

data "azurerm_key_vault" "shared_stripe" {
  name                = "kv-elyse-shared"
  resource_group_name = "rg-elyse-shared"
}

data "azurerm_key_vault_secret" "stripe_secret_key" {
  name         = "STRIPE-LIVE-SECRET-KEY"
  key_vault_id = data.azurerm_key_vault.shared_stripe.id
}

locals {
  stripe_secret = trimspace(data.azurerm_key_vault_secret.stripe_secret_key.value)
  stripe_ready = (
    local.stripe_secret != "REPLACE_ME" &&
    can(regex("^(sk|rk)_live_", local.stripe_secret))
  )
}

provider "stripe" {
  api_key = local.stripe_ready ? local.stripe_secret : "sk_live_not_configured"
}
