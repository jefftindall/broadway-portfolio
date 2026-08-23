# STUDIO-P1-001 — per-environment Table Storage for Studio CRM contacts.
# Standard RA-GRS (eastus2 → paired Central US). The secondary is readable if
# the primary region is down. Writes still require the primary until an operator
# account failover. No always-on Postgres. Connection string is written into SWA
# app settings at apply (same pattern as ACS). Do not output the value.

locals {
  # 3–24 lowercase alphanumeric; staging + prod never share an account.
  studio_crm_storage_name = var.environment == "prod" ? "stelysecrmprod" : "stelysecrmstaging"
}

resource "azurerm_storage_account" "studio_crm" {
  name                            = local.studio_crm_storage_name
  resource_group_name             = azurerm_resource_group.main.name
  location                        = azurerm_resource_group.main.location
  account_tier                    = "Standard"
  account_replication_type        = "RAGRS"
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = true
  tags                            = local.tags
}

resource "azurerm_storage_table" "contacts" {
  name               = "contacts"
  storage_account_id = azurerm_storage_account.studio_crm.id
}

# STUDIO-P6-001 — user profiles (roles + discrete permissions). Same account;
# not a new billable SKU.
resource "azurerm_storage_table" "studio_users" {
  name               = "studioUsers"
  storage_account_id = azurerm_storage_account.studio_crm.id
}

# CD: staging reads the connection string after apply / before SWA upload.
resource "azurerm_role_assignment" "github_actions_crm_key_operator" {
  scope                = azurerm_storage_account.studio_crm.id
  role_definition_name = "Storage Account Key Operator Service Role"
  principal_id         = azuread_service_principal.github_actions.object_id
}
