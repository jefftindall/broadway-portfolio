locals {
  github_repo_slug = "${var.github_owner}/${var.github_repo}"
}

# Entra app used by GitHub Actions via OIDC (no long-lived Azure client secret).
resource "azuread_application" "github_actions" {
  display_name     = "elyse-portfolio-gha-${var.environment}"
  owners           = [data.azuread_client_config.current.object_id]
  sign_in_audience = "AzureADMyOrg"
}

resource "azuread_service_principal" "github_actions" {
  client_id                    = azuread_application.github_actions.client_id
  app_role_assignment_required = false
  owners                       = [data.azuread_client_config.current.object_id]
}

resource "azuread_application_federated_identity_credential" "github_environment" {
  application_id = azuread_application.github_actions.id
  display_name   = "github-env-${var.environment}"
  description    = "GitHub Actions environment ${var.environment}"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${local.github_repo_slug}:environment:${var.environment}"
}

# Allow PRs to deploy to staging via the pull_request subject.
resource "azuread_application_federated_identity_credential" "github_pull_request" {
  count = var.environment == "staging" ? 1 : 0

  application_id = azuread_application.github_actions.id
  display_name   = "github-pull-request"
  description    = "GitHub Actions pull requests"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${local.github_repo_slug}:pull_request"
}

# main branch → prod environment deploys
resource "azuread_application_federated_identity_credential" "github_main" {
  count = var.environment == "prod" ? 1 : 0

  application_id = azuread_application.github_actions.id
  display_name   = "github-ref-main"
  description    = "GitHub Actions pushes to main"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${local.github_repo_slug}:ref:refs/heads/${var.github_branch}"
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
