# Entra app used by GitHub Actions for Terraform plan/apply (separate from SWA deploy identity).
locals {
  github_oidc_repo = "${var.github_owner}@${var.github_owner_id}/${var.github_repo}@${var.github_repo_id}"
}

data "azurerm_client_config" "current" {}

data "azuread_client_config" "current" {}

data "azurerm_subscription" "current" {
  subscription_id = var.subscription_id
}

resource "azuread_application" "terraform" {
  display_name     = "elyse-portfolio-gha-terraform"
  owners           = [data.azuread_client_config.current.object_id]
  sign_in_audience = "AzureADMyOrg"
}

resource "azuread_service_principal" "terraform" {
  client_id                    = azuread_application.terraform.client_id
  app_role_assignment_required = false
  owners                       = [data.azuread_client_config.current.object_id]
}

resource "azuread_application_federated_identity_credential" "staging" {
  application_id = azuread_application.terraform.id
  display_name   = "github-env-staging"
  description    = "GitHub Actions environment staging (Terraform)"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${local.github_oidc_repo}:environment:staging"
}

resource "azuread_application_federated_identity_credential" "prod" {
  application_id = azuread_application.terraform.id
  display_name   = "github-env-prod"
  description    = "GitHub Actions environment prod (Terraform)"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${local.github_oidc_repo}:environment:prod"
}

resource "azuread_application_federated_identity_credential" "pull_request" {
  application_id = azuread_application.terraform.id
  display_name   = "github-pull-request"
  description    = "GitHub Actions pull requests (Terraform plan)"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${local.github_oidc_repo}:pull_request"
}

# Remote state (azurerm backend with Azure AD).
resource "azurerm_role_assignment" "terraform_tfstate_blob" {
  scope                = azurerm_storage_account.tfstate.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azuread_service_principal.terraform.object_id
}

# Env stacks create resources and assign RBAC.
resource "azurerm_role_assignment" "terraform_subscription_contributor" {
  scope                = data.azurerm_subscription.current.id
  role_definition_name = "Contributor"
  principal_id         = azuread_service_principal.terraform.object_id
}

resource "azurerm_role_assignment" "terraform_subscription_uaa" {
  scope                = data.azurerm_subscription.current.id
  role_definition_name = "User Access Administrator"
  principal_id         = azuread_service_principal.terraform.object_id
}

# Key Vault uses data-plane RBAC; subscription Contributor does not grant getSecret.
resource "azurerm_role_assignment" "terraform_kv_secrets_officer" {
  scope                = data.azurerm_subscription.current.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = azuread_service_principal.terraform.object_id
}

# Env stacks manage azuread_application / service principals (Studio + deploy OIDC apps).
resource "azuread_directory_role" "cloud_app_admin" {
  display_name = "Cloud Application Administrator"
}

resource "azuread_directory_role_assignment" "terraform_cloud_app_admin" {
  role_id             = azuread_directory_role.cloud_app_admin.template_id
  principal_object_id = azuread_service_principal.terraform.object_id
}

# Repo-level vars for Terraform workflows (distinct from per-env AZURE_CLIENT_ID deploy identity).
resource "github_actions_variable" "azure_tf_client_id" {
  count         = var.manage_github_actions ? 1 : 0
  repository    = var.github_repo
  variable_name = "AZURE_TF_CLIENT_ID"
  value         = azuread_application.terraform.client_id
}

resource "github_actions_variable" "azure_tf_tenant_id" {
  count         = var.manage_github_actions ? 1 : 0
  repository    = var.github_repo
  variable_name = "AZURE_TF_TENANT_ID"
  value         = data.azurerm_client_config.current.tenant_id
}

resource "github_actions_variable" "azure_tf_subscription_id" {
  count         = var.manage_github_actions ? 1 : 0
  repository    = var.github_repo
  variable_name = "AZURE_TF_SUBSCRIPTION_ID"
  value         = data.azurerm_client_config.current.subscription_id
}
