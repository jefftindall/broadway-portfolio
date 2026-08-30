# GitHub Actions Terraform identity in the CIAM tenant (ACCOUNT-P1-001).
# Mirrors elyse-portfolio-gha-terraform in the workforce tenant so env stacks can
# manage contact OIDC apps via azuread.contact_ciam without operator App Admin.
# Requires a delegated operator session with rights to create apps in the CIAM tenant.

locals {
  contact_ciam_ready = (
    local.contact_ciam_tenant_id_effective != "REPLACE_ME" &&
    can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", local.contact_ciam_tenant_id_effective))
  )
}

resource "azuread_application" "terraform_ciam" {
  count    = local.contact_ciam_ready && var.manage_contact_ciam_gha ? 1 : 0
  provider = azuread.contact_ciam

  display_name     = "elyse-portfolio-gha-ciam-terraform"
  sign_in_audience = "AzureADMyOrg"
  owners           = [data.azuread_client_config.contact_ciam[0].object_id]

  api {
    requested_access_token_version = 2
  }

  lifecycle {
    ignore_changes = [owners]
  }
}

resource "azuread_service_principal" "terraform_ciam" {
  count    = local.contact_ciam_ready && var.manage_contact_ciam_gha ? 1 : 0
  provider = azuread.contact_ciam

  client_id                    = azuread_application.terraform_ciam[0].client_id
  app_role_assignment_required = false
  owners                       = [data.azuread_client_config.contact_ciam[0].object_id]

  lifecycle {
    ignore_changes = [owners]
  }
}

resource "azuread_application_federated_identity_credential" "terraform_ciam_staging" {
  count    = local.contact_ciam_ready && var.manage_contact_ciam_gha ? 1 : 0
  provider = azuread.contact_ciam

  application_id = azuread_application.terraform_ciam[0].id
  display_name   = "github-env-staging"
  description    = "GitHub Actions environment staging (CIAM Terraform)"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${local.github_oidc_repo}:environment:staging"
}

resource "azuread_application_federated_identity_credential" "terraform_ciam_prod" {
  count    = local.contact_ciam_ready && var.manage_contact_ciam_gha ? 1 : 0
  provider = azuread.contact_ciam

  application_id = azuread_application.terraform_ciam[0].id
  display_name   = "github-env-prod"
  description    = "GitHub Actions environment prod (CIAM Terraform)"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${local.github_oidc_repo}:environment:prod"
}

resource "azuread_application_federated_identity_credential" "terraform_ciam_pull_request" {
  count    = local.contact_ciam_ready && var.manage_contact_ciam_gha ? 1 : 0
  provider = azuread.contact_ciam

  application_id = azuread_application.terraform_ciam[0].id
  display_name   = "github-pull-request"
  description    = "GitHub Actions pull requests (CIAM Terraform plan)"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${local.github_oidc_repo}:pull_request"
}

resource "azuread_directory_role" "contact_ciam_app_admin" {
  count        = local.contact_ciam_ready && var.manage_contact_ciam_gha ? 1 : 0
  provider     = azuread.contact_ciam
  display_name = "Application Administrator"
}

resource "azuread_directory_role_assignment" "terraform_ciam_app_admin" {
  count    = local.contact_ciam_ready && var.manage_contact_ciam_gha ? 1 : 0
  provider = azuread.contact_ciam

  role_id             = azuread_directory_role.contact_ciam_app_admin[0].template_id
  principal_object_id = azuread_service_principal.terraform_ciam[0].object_id
}

resource "azurerm_key_vault_secret" "contact_ciam_tf_client_id" {
  name = "CONTACT-CIAM-TF-CLIENT-ID"
  value = (
    local.contact_ciam_ready && var.manage_contact_ciam_gha ?
    azuread_application.terraform_ciam[0].client_id :
    "REPLACE_ME"
  )
  key_vault_id = azurerm_key_vault.shared.id
  depends_on   = [azurerm_role_assignment.shared_kv_admin]
}

data "azuread_client_config" "contact_ciam" {
  count    = local.contact_ciam_ready && var.manage_contact_ciam_gha ? 1 : 0
  provider = azuread.contact_ciam
}
