# CIAM Graph apply hook (ACCOUNT-P1-007).
# Runs after OIDC app + service principal exist. Idempotent plan/apply via
# scripts/apply-contact-ciam-config.mjs — create/update bodies land in P1-008+.

locals {
  contact_ciam_config_repo_root = abspath("${path.module}/../../..")
  contact_ciam_config_idp_files = [
    for name in sort(fileset("${local.contact_ciam_config_repo_root}/infra/contact-ciam/idps", "*.json")) :
    "${local.contact_ciam_config_repo_root}/infra/contact-ciam/idps/${name}"
  ]
  contact_ciam_config_manifest_files = concat(
    local.contact_ciam_config_idp_files,
    [
      "${local.contact_ciam_config_repo_root}/infra/contact-ciam/flows/${var.environment}.json",
      "${local.contact_ciam_config_repo_root}/infra/contact-ciam/branding/theme.json",
    ],
  )
  contact_ciam_config_manifest_hash = local.contact_ciam_ready ? sha256(join("", [
    for file_path in local.contact_ciam_config_manifest_files : filesha256(file_path)
  ])) : "disabled"
}

resource "terraform_data" "contact_ciam_config" {
  count = local.contact_ciam_ready && var.manage_contact_ciam_config ? 1 : 0

  triggers_replace = [
    local.contact_ciam_config_manifest_hash,
    try(azuread_application.contact_swa[0].client_id, data.azurerm_key_vault_secret.contact_oidc_client_id.value),
    var.environment,
  ]

  provisioner "local-exec" {
    interpreter = ["node"]
    command     = replace(abspath("${path.module}/../../../scripts/apply-contact-ciam-config.mjs"), "\\", "/")
    working_dir = local.contact_ciam_config_repo_root
    environment = {
      CONTACT_CIAM_ENV            = var.environment
      CONTACT_CIAM_TENANT_ID      = local.contact_ciam_tenant_id
      CONTACT_OIDC_CLIENT_ID      = try(azuread_application.contact_swa[0].client_id, data.azurerm_key_vault_secret.contact_oidc_client_id.value)
      CONTACT_CIAM_TF_CLIENT_ID   = trimspace(data.azurerm_key_vault_secret.contact_ciam_tf_client_id.value)
      AZURE_SHARED_KEY_VAULT_NAME = data.azurerm_key_vault.shared.name
      CONTACT_CIAM_REPO_ROOT      = local.contact_ciam_config_repo_root
      CONTACT_CIAM_SKIP_APPLY     = var.contact_ciam_skip_apply ? "true" : "false"
    }
  }

  depends_on = [
    azuread_service_principal.contact_swa,
    azurerm_key_vault_secret.contact_oidc_client_id,
  ]
}

data "azurerm_key_vault_secret" "contact_ciam_tf_client_id" {
  name         = "CONTACT-CIAM-TF-CLIENT-ID"
  key_vault_id = data.azurerm_key_vault.shared.id
}
