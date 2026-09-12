# GitHub Actions Terraform identity in the CIAM tenant (ACCOUNT-P1-001).
# Mirrors elyse-portfolio-gha-terraform in the workforce tenant so env stacks can
# manage contact OIDC apps via azuread.contact_ciam without operator App Admin.
# Requires a delegated operator session with rights to create apps in the CIAM tenant.

locals {
  contact_ciam_ready = (
    local.contact_ciam_tenant_id_effective != "REPLACE_ME" &&
    can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", local.contact_ciam_tenant_id_effective))
  )

  # Microsoft Graph application permissions for apply-contact-ciam-config.mjs (ACCOUNT-P1-010+).
  ms_graph_app_id = "00000003-0000-0000-c000-000000000000"
  contact_ciam_graph_app_roles = {
    identity_provider_rw = "898868ce-daac-4334-9a4c-57d6860f305b" # IdentityProvider.ReadWrite.All
    organization_rw      = "62a82d76-70ea-41e2-9197-370581704d8e" # Organization.ReadWrite.All
    policy_rw            = "242b12ff-6bd3-4138-b447-eb1afa57df2c" # Policy.ReadWrite.ApplicationConfiguration
    application_rw       = "1bfefb4e-e0b5-418b-a88f-73c46d2cc8e9" # Application.ReadWrite.All
  }
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

  required_resource_access {
    resource_app_id = local.ms_graph_app_id

    dynamic "resource_access" {
      for_each = local.contact_ciam_graph_app_roles
      content {
        id   = resource_access.value
        type = "Role"
      }
    }
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

data "azuread_service_principal" "ms_graph_ciam" {
  count     = local.contact_ciam_ready && var.manage_contact_ciam_gha ? 1 : 0
  provider  = azuread.contact_ciam
  client_id = local.ms_graph_app_id
}

resource "azuread_app_role_assignment" "terraform_ciam_graph" {
  for_each = local.contact_ciam_ready && var.manage_contact_ciam_gha ? local.contact_ciam_graph_app_roles : {}

  provider = azuread.contact_ciam

  app_role_id         = each.value
  principal_object_id = azuread_service_principal.terraform_ciam[0].object_id
  resource_object_id  = data.azuread_service_principal.ms_graph_ciam[0].object_id
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
