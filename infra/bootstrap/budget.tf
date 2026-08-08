# OPS-P4-001 — Subscription monthly budget = ceil(expected retail × 1.25).
# Expected breakdown SoT: docs/runbooks/cost-and-quotas.md (recalculate on infra change).
# Threshold emails go to ALERT-EMAIL only (ops). Monthly digests cover both contacts.

data "azurerm_key_vault_secret" "alert_email_for_budget" {
  name         = azurerm_key_vault_secret.alert_email.name
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_key_vault_secret.alert_email]
}

locals {
  budget_alert_email_raw = trimspace(data.azurerm_key_vault_secret.alert_email_for_budget.value)
  budget_alert_email_configured = (
    local.budget_alert_email_raw != "" &&
    local.budget_alert_email_raw != "REPLACE_ME"
  )
  # Fixed start (first of month). Do not roll this forward — recreating the budget resets history.
  budget_start_date = "2026-08-01T00:00:00Z"
  # Expected ~$24.54/mo (eastus2 retail, 2026-08-08) → ceil(24.54 * 1.25) = 31
  subscription_budget_usd = 31
}

resource "azurerm_consumption_budget_subscription" "monthly" {
  name            = "budget-elyse-portfolio-monthly"
  subscription_id = data.azurerm_subscription.current.id

  amount     = local.subscription_budget_usd
  time_grain = "Monthly"

  time_period {
    start_date = local.budget_start_date
  }

  notification {
    enabled        = true
    threshold      = 80.0
    operator       = "GreaterThan"
    threshold_type = "Actual"

    contact_emails = local.budget_alert_email_configured ? [local.budget_alert_email_raw] : []
    # Required when ALERT-EMAIL is still REPLACE_ME so the notification block is valid.
    contact_roles = local.budget_alert_email_configured ? [] : ["Owner"]
  }

  notification {
    enabled        = true
    threshold      = 100.0
    operator       = "GreaterThan"
    threshold_type = "Actual"

    contact_emails = local.budget_alert_email_configured ? [local.budget_alert_email_raw] : []
    contact_roles  = local.budget_alert_email_configured ? [] : ["Owner"]
  }
}
