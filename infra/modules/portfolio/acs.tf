# Shared ACS (bootstrap) — email + SMS secrets live in kv-elyse-shared.
# Per-env Terraform only wires SWA app settings; CONTACT_SMS_ENABLED is on for both
# environments (API still skips SMS while ACS-SMS-FROM is REPLACE_ME / empty,
# or until toll-free verification completes — lease may still bill ~$2/mo).

locals {
  contact_sms_enabled = "true"
}

data "azurerm_key_vault_secret" "acs_connection_string" {
  name         = "ACS-CONNECTION-STRING"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "acs_email_sender" {
  name         = "ACS-EMAIL-SENDER"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "acs_sms_from" {
  name         = "ACS-SMS-FROM"
  key_vault_id = data.azurerm_key_vault.shared.id
}
