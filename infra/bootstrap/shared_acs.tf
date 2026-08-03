# Shared Azure Communication Services — one email domain + SMS number for staging and prod.
# Secrets land in kv-elyse-shared; portfolio environments data-source them into SWA.

locals {
  shared_acs_name       = "acs-elyse-shared"
  shared_acs_email_name = "email-elyse-shared"
}

resource "azurerm_communication_service" "shared" {
  name                = local.shared_acs_name
  resource_group_name = azurerm_resource_group.shared.name
  data_location       = "United States"
  tags                = local.shared_tags
}

resource "azurerm_email_communication_service" "shared" {
  name                = local.shared_acs_email_name
  resource_group_name = azurerm_resource_group.shared.name
  data_location       = "United States"
  tags                = local.shared_tags
}

resource "azurerm_email_communication_service_domain" "shared_azure_managed" {
  name              = "AzureManagedDomain"
  email_service_id  = azurerm_email_communication_service.shared.id
  domain_management = "AzureManaged"
}

resource "azurerm_communication_service_email_domain_association" "shared" {
  communication_service_id = azurerm_communication_service.shared.id
  email_service_domain_id  = azurerm_email_communication_service_domain.shared_azure_managed.id
}

# Terraform-owned — refreshed on bootstrap apply.
resource "azurerm_key_vault_secret" "acs_connection_string" {
  name         = "ACS-CONNECTION-STRING"
  value        = azurerm_communication_service.shared.primary_connection_string
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]
  content_type = "text/plain"
}

resource "azurerm_key_vault_secret" "acs_email_sender" {
  name         = "ACS-EMAIL-SENDER"
  value        = "DoNotReply@${azurerm_email_communication_service_domain.shared_azure_managed.mail_from_sender_domain}"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]
  content_type = "text/plain"
}

# Toll-free from-number (E.164). Purchase + verification are manual on acs-elyse-shared.
resource "azurerm_key_vault_secret" "acs_sms_from" {
  name         = "ACS-SMS-FROM"
  value        = "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]

  lifecycle {
    ignore_changes = [value]
  }
}
