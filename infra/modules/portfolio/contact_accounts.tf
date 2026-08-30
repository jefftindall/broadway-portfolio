# Contact accounts feature flag (ACCOUNT-P1-006).
# OIDC app registration + vault secrets: contact_ciam_entra.tf

locals {
  contact_accounts_enabled_setting = var.contact_accounts_enabled ? "true" : "false"
}
