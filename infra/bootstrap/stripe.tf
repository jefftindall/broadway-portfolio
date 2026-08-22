# Stripe lesson payments live in kv-elyse-shared (test + live), not env vaults.
# Environments data-source these secrets; this stack must not read env Key Vaults
# or env Terraform state. See .cursor/rules/terraform-stack-direction.mdc.

locals {
  stripe_placeholder_key = "sk_test_not_configured"

  stripe_test_secret_value = trimspace(data.azurerm_key_vault_secret.stripe_test_secret.value)
  stripe_live_secret_value = trimspace(data.azurerm_key_vault_secret.stripe_live_secret.value)

  stripe_test_ready = (
    local.stripe_test_secret_value != "REPLACE_ME" &&
    can(regex("^(sk|rk)_test_", local.stripe_test_secret_value))
  )
  stripe_live_ready = (
    local.stripe_live_secret_value != "REPLACE_ME" &&
    can(regex("^(sk|rk)_live_", local.stripe_live_secret_value))
  )

  lesson_rate_ids = toset(compact(split(",", data.external.lesson_rates.result.ids)))
  lesson_rates = {
    for id in local.lesson_rate_ids : id => {
      label = data.external.lesson_rates.result["${id}_label"]
      cents = tonumber(data.external.lesson_rates.result["${id}_cents"])
    }
  }
}

# Advertised /lessons/book rates (USD cents). All external values are strings.
data "external" "lesson_rates" {
  program = ["node", replace(abspath("${path.module}/../../scripts/read-lesson-rates.mjs"), "\\", "/")]
}

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

resource "azurerm_key_vault_secret" "stripe_test_payment_link_30min" {
  name         = "STRIPE-TEST-PAYMENT-LINK-30MIN"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "stripe_test_payment_link_60min" {
  name         = "STRIPE-TEST-PAYMENT-LINK-60MIN"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "stripe_live_payment_link_30min" {
  name         = "STRIPE-LIVE-PAYMENT-LINK-30MIN"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

resource "azurerm_key_vault_secret" "stripe_live_payment_link_60min" {
  name         = "STRIPE-LIVE-PAYMENT-LINK-60MIN"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}

data "azurerm_key_vault_secret" "stripe_test_secret" {
  name         = "STRIPE-TEST-SECRET-KEY"
  key_vault_id = azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "stripe_live_secret" {
  name         = "STRIPE-LIVE-SECRET-KEY"
  key_vault_id = azurerm_key_vault.shared.id
}

provider "stripe" {
  alias   = "test"
  api_key = local.stripe_test_ready ? local.stripe_test_secret_value : local.stripe_placeholder_key
}

provider "stripe" {
  alias   = "live"
  api_key = local.stripe_live_ready ? local.stripe_live_secret_value : local.stripe_placeholder_key
}

module "stripe_test" {
  count  = local.stripe_test_ready ? 1 : 0
  source = "./modules/stripe_catalog"
  providers = {
    stripe = stripe.test
  }
  rates       = local.lesson_rates
  webhook_url = var.stripe_webhook_url_test
  mode        = "test"
}

module "stripe_live" {
  count  = local.stripe_live_ready ? 1 : 0
  source = "./modules/stripe_catalog"
  providers = {
    stripe = stripe.live
  }
  rates       = local.lesson_rates
  webhook_url = var.stripe_webhook_url_live
  mode        = "live"
}

# Signing secrets are Terraform-managed (returned only at webhook create).
# First apply of the placeholder STRIPE-*-SECRET-KEY resources makes
# stripe_*_ready unknown — target those secrets, copy keys, then apply the catalog.
resource "azurerm_key_vault_secret" "stripe_test_webhook_secret" {
  name         = "STRIPE-TEST-WEBHOOK-SECRET"
  value        = try(module.stripe_test[0].webhook_secret, "REPLACE_ME")
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]
}

resource "azurerm_key_vault_secret" "stripe_live_webhook_secret" {
  name         = "STRIPE-LIVE-WEBHOOK-SECRET"
  value        = try(module.stripe_live[0].webhook_secret, "REPLACE_ME")
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]
}

resource "terraform_data" "stripe_payment_links_test" {
  count = local.stripe_test_ready ? 1 : 0

  triggers_replace = [
    jsonencode(module.stripe_test[0].price_ids),
    var.stripe_payment_link_success_url_test,
  ]

  provisioner "local-exec" {
    interpreter = ["node"]
    command     = replace(abspath("${path.module}/../../scripts/upsert-stripe-payment-links.mjs"), "\\", "/")
    working_dir = abspath("${path.module}/../..")
    environment = {
      STRIPE_MODE                     = "test"
      AZURE_SHARED_KEY_VAULT_NAME     = azurerm_key_vault.shared.name
      STRIPE_PRICE_IDS                = jsonencode(module.stripe_test[0].price_ids)
      STRIPE_PAYMENT_LINK_SUCCESS_URL = var.stripe_payment_link_success_url_test
    }
  }

  depends_on = [
    azurerm_key_vault_secret.stripe_test_payment_link_30min,
    azurerm_key_vault_secret.stripe_test_payment_link_60min,
  ]
}

resource "terraform_data" "stripe_payment_links_live" {
  count = local.stripe_live_ready ? 1 : 0

  triggers_replace = [
    jsonencode(module.stripe_live[0].price_ids),
    var.stripe_payment_link_success_url_live,
  ]

  provisioner "local-exec" {
    interpreter = ["node"]
    command     = replace(abspath("${path.module}/../../scripts/upsert-stripe-payment-links.mjs"), "\\", "/")
    working_dir = abspath("${path.module}/../..")
    environment = {
      STRIPE_MODE                     = "live"
      AZURE_SHARED_KEY_VAULT_NAME     = azurerm_key_vault.shared.name
      STRIPE_PRICE_IDS                = jsonencode(module.stripe_live[0].price_ids)
      STRIPE_PAYMENT_LINK_SUCCESS_URL = var.stripe_payment_link_success_url_live
    }
  }

  depends_on = [
    azurerm_key_vault_secret.stripe_live_payment_link_30min,
    azurerm_key_vault_secret.stripe_live_payment_link_60min,
  ]
}
