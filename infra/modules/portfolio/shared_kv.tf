# Shared foundation vault (bootstrap) — site-build + Turnstile secrets identical
# across staging and prod so a single release artifact embeds one source of truth.
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
