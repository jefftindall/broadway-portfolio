# Shared foundation vault (bootstrap) — site-build, Turnstile, ACS, ALERT-* ops
# contacts, and Stripe TEST/LIVE secrets identical across staging/prod mappings
# so a single release artifact / one SMS number / one on-call set is shared.
# Deploy OIDC principals get Key Vault Secrets User on this vault from bootstrap
# (not here) so Build release (prod identity) is not blocked on prod Terraform apply.

data "azurerm_key_vault" "shared" {
  name                = var.shared_key_vault_name
  resource_group_name = var.shared_key_vault_resource_group_name
}

data "azurerm_key_vault_secret" "site_contact_email" {
  name         = "SITE-CONTACT-EMAIL"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "site_contact_phone" {
  name         = "SITE-CONTACT-PHONE"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "turnstile_secret_key" {
  name         = "TURNSTILE-SECRET-KEY"
  key_vault_id = data.azurerm_key_vault.shared.id
}

# Ops Action Group contacts (OPS-P1-*). Placeholders (REPLACE_ME) skip receivers in monitoring.tf.
data "azurerm_key_vault_secret" "alert_email" {
  name         = "ALERT-EMAIL"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "alert_sms_phone" {
  name         = "ALERT-SMS-PHONE"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "alert_voice_phone" {
  name         = "ALERT-VOICE-PHONE"
  key_vault_id = data.azurerm_key_vault.shared.id
}
