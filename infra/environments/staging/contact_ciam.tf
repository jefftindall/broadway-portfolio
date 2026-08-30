# CIAM tenant provider alias — reads shared vault metadata written by bootstrap.

data "azurerm_client_config" "current" {}

data "azurerm_key_vault" "shared" {
  name                = "kv-elyse-shared"
  resource_group_name = "rg-elyse-shared"
}

data "azurerm_key_vault_secret" "contact_ciam_tenant_id" {
  name         = "CONTACT-CIAM-TENANT-ID"
  key_vault_id = data.azurerm_key_vault.shared.id
}

data "azurerm_key_vault_secret" "contact_ciam_tf_client_id" {
  name         = "CONTACT-CIAM-TF-CLIENT-ID"
  key_vault_id = data.azurerm_key_vault.shared.id
}

locals {
  contact_ciam_tenant_id = trimspace(data.azurerm_key_vault_secret.contact_ciam_tenant_id.value)
  contact_ciam_ready = (
    local.contact_ciam_tenant_id != "" &&
    local.contact_ciam_tenant_id != "REPLACE_ME" &&
    can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", local.contact_ciam_tenant_id))
  )
  contact_ciam_tf_client_id = trimspace(data.azurerm_key_vault_secret.contact_ciam_tf_client_id.value)
  contact_ciam_tf_ready = (
    local.contact_ciam_ready &&
    local.contact_ciam_tf_client_id != "" &&
    local.contact_ciam_tf_client_id != "REPLACE_ME"
  )
  contact_ciam_azuread_oidc = var.contact_ciam_azuread_use_oidc
}

provider "azuread" {
  alias     = "contact_ciam"
  tenant_id = local.contact_ciam_ready ? local.contact_ciam_tenant_id : data.azurerm_client_config.current.tenant_id
  client_id = local.contact_ciam_azuread_oidc && local.contact_ciam_tf_ready ? local.contact_ciam_tf_client_id : null
  use_cli   = !local.contact_ciam_azuread_oidc
}
