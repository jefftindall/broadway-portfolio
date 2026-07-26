# GitHub Actions environments + OIDC variables (managed when var.manage_github_actions is true).
# Requires the root module to configure the integrations/github provider (GITHUB_TOKEN / GH_TOKEN).
# The GitHub App used by Studio is created once in the GitHub UI — Terraform cannot create Apps.

resource "github_repository_environment" "this" {
  count       = var.manage_github_actions ? 1 : 0
  environment = var.environment
  repository  = var.github_repo
}

resource "github_actions_environment_variable" "azure_client_id" {
  count         = var.manage_github_actions ? 1 : 0
  environment   = github_repository_environment.this[0].environment
  repository    = var.github_repo
  variable_name = "AZURE_CLIENT_ID"
  value         = azuread_application.github_actions.client_id
}

resource "github_actions_environment_variable" "azure_tenant_id" {
  count         = var.manage_github_actions ? 1 : 0
  environment   = github_repository_environment.this[0].environment
  repository    = var.github_repo
  variable_name = "AZURE_TENANT_ID"
  value         = data.azurerm_client_config.current.tenant_id
}

resource "github_actions_environment_variable" "azure_subscription_id" {
  count         = var.manage_github_actions ? 1 : 0
  environment   = github_repository_environment.this[0].environment
  repository    = var.github_repo
  variable_name = "AZURE_SUBSCRIPTION_ID"
  value         = data.azurerm_client_config.current.subscription_id
}

resource "github_actions_environment_variable" "azure_resource_group" {
  count         = var.manage_github_actions ? 1 : 0
  environment   = github_repository_environment.this[0].environment
  repository    = var.github_repo
  variable_name = "AZURE_RESOURCE_GROUP"
  value         = azurerm_resource_group.main.name
}

resource "github_actions_environment_variable" "azure_static_web_app_name" {
  count         = var.manage_github_actions ? 1 : 0
  environment   = github_repository_environment.this[0].environment
  repository    = var.github_repo
  variable_name = "AZURE_STATIC_WEB_APP_NAME"
  value         = azurerm_static_web_app.main.name
}
