locals {
  # GitHub Actions OIDC subjects use owner@id/repo@id (not owner/repo).
  # Example assertion: repo:jefftindall@10339968/broadway-portfolio@1312787625:environment:staging
  github_oidc_repo = "${var.github_owner}@${var.github_owner_id}/${var.github_repo}@${var.github_repo_id}"
}

# Entra app used by GitHub Actions via OIDC (no long-lived Azure client secret).
resource "azuread_application" "github_actions" {
  display_name     = "elyse-portfolio-gha-${var.environment}"
  owners           = [data.azuread_client_config.current.object_id]
  sign_in_audience = "AzureADMyOrg"

  lifecycle {
    ignore_changes = [owners]
  }
}

resource "azuread_service_principal" "github_actions" {
  client_id                    = azuread_application.github_actions.client_id
  app_role_assignment_required = false
  owners                       = [data.azuread_client_config.current.object_id]

  lifecycle {
    ignore_changes = [owners]
  }
}

resource "azuread_application_federated_identity_credential" "github_environment" {
  application_id = azuread_application.github_actions.id
  display_name   = "github-env-${var.environment}"
  description    = "GitHub Actions environment ${var.environment}"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${local.github_oidc_repo}:environment:${var.environment}"
}

# Allow PRs to deploy to staging via the pull_request subject.
resource "azuread_application_federated_identity_credential" "github_pull_request" {
  count = var.environment == "staging" ? 1 : 0

  application_id = azuread_application.github_actions.id
  display_name   = "github-pull-request"
  description    = "GitHub Actions pull requests"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${local.github_oidc_repo}:pull_request"
}

# main branch → prod environment deploys
resource "azuread_application_federated_identity_credential" "github_main" {
  count = var.environment == "prod" ? 1 : 0

  application_id = azuread_application.github_actions.id
  display_name   = "github-ref-main"
  description    = "GitHub Actions pushes to main"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${local.github_oidc_repo}:ref:refs/heads/${var.github_branch}"
}

resource "azurerm_role_assignment" "github_actions_rg_reader" {
  scope                = azurerm_resource_group.main.id
  role_definition_name = "Reader"
  principal_id         = azuread_service_principal.github_actions.object_id
}

resource "azurerm_role_assignment" "github_actions_swa_contributor" {
  scope                = azurerm_static_web_app.main.id
  role_definition_name = "Contributor"
  principal_id         = azuread_service_principal.github_actions.object_id
}

# Deploy jobs read env-scoped API secrets from Key Vault (sync-swa / apply).
# Site-build secrets are in the bootstrap shared vault — see shared_kv.tf.
resource "azurerm_role_assignment" "github_actions_kv_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azuread_service_principal.github_actions.object_id
}
