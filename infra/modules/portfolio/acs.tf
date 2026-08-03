# Azure Communication Services — Email (all envs) + SMS wiring (prod values manual).
# Connection string and managed MailFrom are Terraform-managed into SWA app settings.
# Toll-free SMS number is purchased in the portal (prod) and stored as ACS-SMS-FROM.
# Turnstile + SITE-CONTACT-* live in bootstrap kv-elyse-shared (shared_kv.tf).

locals {
  acs_name            = "acs-elyse-portfolio-${local.name_suffix}"
  acs_email_name      = "email-elyse-portfolio-${local.name_suffix}"
  contact_sms_enabled = var.environment == "prod" ? "true" : "false"
}

resource "azurerm_communication_service" "main" {
  name                = local.acs_name
  resource_group_name = azurerm_resource_group.main.name
  data_location       = "United States"
  tags                = local.tags
}

resource "azurerm_email_communication_service" "main" {
  name                = local.acs_email_name
  resource_group_name = azurerm_resource_group.main.name
  data_location       = "United States"
  tags                = local.tags
}

resource "azurerm_email_communication_service_domain" "azure_managed" {
  name              = "AzureManagedDomain"
  email_service_id  = azurerm_email_communication_service.main.id
  domain_management = "AzureManaged"
}

resource "azurerm_communication_service_email_domain_association" "main" {
  communication_service_id = azurerm_communication_service.main.id
  email_service_domain_id  = azurerm_email_communication_service_domain.azure_managed.id
}

# Terraform-owned — refreshed on apply (not REPLACE_ME).
resource "azurerm_key_vault_secret" "acs_connection_string" {
  name         = "ACS-CONNECTION-STRING"
  value        = azurerm_communication_service.main.primary_connection_string
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]
  content_type = "text/plain"
}

resource "azurerm_key_vault_secret" "acs_email_sender" {
  name         = "ACS-EMAIL-SENDER"
  value        = "DoNotReply@${azurerm_email_communication_service_domain.azure_managed.mail_from_sender_domain}"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]
  content_type = "text/plain"
}

# Prod SMS from-number (E.164). Purchase + verification are manual; see rotate-secrets.md.
resource "azurerm_key_vault_secret" "acs_sms_from" {
  name         = "ACS-SMS-FROM"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}

data "azurerm_key_vault_secret" "acs_sms_from" {
  name         = azurerm_key_vault_secret.acs_sms_from.name
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_key_vault_secret.acs_sms_from]
}
