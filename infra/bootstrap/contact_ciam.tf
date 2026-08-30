# Shared Entra External ID (CIAM) tenant for student/parent sign-in (ACCOUNT-P1-001).
# Env stacks create per-environment OIDC app registrations in this tenant.
# Social IdP federation (Google / Apple / MSA) stays manual — see
# docs/runbooks/contact-accounts-social-idps.md.

locals {
  contact_ciam_tenant_id_effective = var.manage_contact_ciam_tenant ? (
    try(azapi_resource.contact_ciam[0].output.properties.tenantId, "REPLACE_ME")
    ) : (
    trimspace(var.contact_ciam_tenant_id) != "" ? trimspace(var.contact_ciam_tenant_id) : "REPLACE_ME"
  )

  contact_ciam_domain_prefix_effective = var.manage_contact_ciam_tenant ? (
    var.contact_ciam_domain_prefix
  ) : trimspace(var.contact_ciam_domain_prefix)

  contact_ciam_oidc_issuer = (
    local.contact_ciam_tenant_id_effective != "REPLACE_ME" &&
    local.contact_ciam_domain_prefix_effective != ""
  ) ? "https://${local.contact_ciam_domain_prefix_effective}.ciamlogin.com/${local.contact_ciam_tenant_id_effective}/v2.0" : "REPLACE_ME"
}

resource "azapi_resource" "contact_ciam" {
  count = var.manage_contact_ciam_tenant ? 1 : 0

  type      = "Microsoft.AzureActiveDirectory/ciamDirectories@2023-05-17-preview"
  name      = var.contact_ciam_domain_prefix
  location  = var.contact_ciam_location
  parent_id = azurerm_resource_group.shared.id

  body = {
    sku = {
      name = "Base"
      tier = "A0"
    }
    properties = {
      createTenantProperties = {
        countryCode = var.contact_ciam_country_code
        displayName = var.contact_ciam_display_name
      }
    }
  }

  response_export_values = [
    "properties.tenantId",
    "properties.domainName",
  ]

  lifecycle {
    ignore_changes = [body]
  }
}

resource "azurerm_key_vault_secret" "contact_ciam_tenant_id" {
  name         = "CONTACT-CIAM-TENANT-ID"
  value        = local.contact_ciam_tenant_id_effective
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]
}

resource "azurerm_key_vault_secret" "contact_ciam_domain_prefix" {
  name         = "CONTACT-CIAM-DOMAIN-PREFIX"
  value        = local.contact_ciam_domain_prefix_effective != "" ? local.contact_ciam_domain_prefix_effective : "REPLACE_ME"
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]
}

resource "azurerm_key_vault_secret" "contact_ciam_oidc_issuer" {
  name         = "CONTACT-CIAM-OIDC-ISSUER"
  value        = local.contact_ciam_oidc_issuer
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]
}
