# Dedicated Studio smoke monitor (TEST-C-005). Password is Terraform-managed
# (same class as AAD-CLIENT-SECRET: also in TF state). TOTP seed is operator-set
# and never written by Terraform. Apply requires User Administrator (or Global
# Administrator) — bootstrap is normally local; do not add that role to the
# GitHub Terraform SP unless bootstrap starts running from Actions.

data "azuread_domains" "initial" {
  only_initial = true
}

locals {
  monitor_upn = var.monitor_upn != "" ? var.monitor_upn : "studio-monitor@${data.azuread_domains.initial.domains[0].domain_name}"
}

resource "random_password" "monitor" {
  length           = 32
  special          = true
  override_special = "-_+="
  min_lower        = 1
  min_upper        = 1
  min_numeric      = 1
  min_special      = 1
}

resource "azuread_user" "monitor" {
  user_principal_name   = local.monitor_upn
  display_name          = "Studio monitor"
  mail_nickname         = "studiomonitor"
  password              = random_password.monitor.result
  force_password_change = false
  account_enabled       = true

  disable_password_expiration = true
}

resource "azurerm_key_vault_secret" "monitor_upn" {
  name         = "MONITOR-UPN"
  value        = azuread_user.monitor.user_principal_name
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]
}

resource "azurerm_key_vault_secret" "monitor_password" {
  name         = "MONITOR-PASSWORD"
  value        = random_password.monitor.result
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]
}

resource "azurerm_key_vault_secret" "monitor_totp_seed" {
  name         = "MONITOR-TOTP-SEED"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value, tags]
  }
}
