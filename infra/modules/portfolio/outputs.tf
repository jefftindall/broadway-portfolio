output "environment" {
  value = var.environment
}

output "resource_group_name" {
  value = azurerm_resource_group.main.name
}

output "static_web_app_name" {
  value = azurerm_static_web_app.main.name
}

output "static_web_app_default_hostname" {
  value = azurerm_static_web_app.main.default_host_name
}

output "static_web_app_api_key" {
  value     = azurerm_static_web_app.main.api_key
  sensitive = true
}

output "key_vault_name" {
  value = azurerm_key_vault.main.name
}

output "key_vault_uri" {
  value = azurerm_key_vault.main.vault_uri
}

output "custom_domain_validation_token" {
  description = "TXT record value for domain validation (when custom_domain is set)"
  value       = try(azurerm_static_web_app_custom_domain.apex[0].validation_token, null)
  sensitive   = true
}

output "managed_identity_principal_id" {
  value = azurerm_static_web_app.main.identity[0].principal_id
}

output "entra_application_id" {
  description = "Entra application (client) ID used by SWA custom authentication"
  value       = azuread_application.swa.client_id
}

output "entra_application_object_id" {
  value = azuread_application.swa.object_id
}

output "entra_service_principal_id" {
  value = azuread_service_principal.swa.object_id
}

output "entra_tenant_id" {
  value = data.azurerm_client_config.current.tenant_id
}

output "entra_openid_issuer" {
  description = "Value for openIdIssuer in staticwebapp.config.json"
  value       = "https://login.microsoftonline.com/${data.azurerm_client_config.current.tenant_id}/v2.0"
}

output "entra_redirect_uris" {
  description = "Redirect URIs registered for this environment (Azure hostname + custom domains)"
  value       = local.redirect_uris
}

output "github_actions_client_id" {
  description = "Entra application (client) ID for GitHub Actions OIDC"
  value       = azuread_application.github_actions.client_id
}

output "github_actions_tenant_id" {
  value = data.azurerm_client_config.current.tenant_id
}

output "github_actions_subscription_id" {
  value = data.azurerm_client_config.current.subscription_id
}

output "github_actions_oidc_subjects" {
  description = "Federated credential subjects expected by Entra for this environment"
  value = compact([
    "repo:${var.github_owner}/${var.github_repo}:environment:${var.environment}",
    var.environment == "staging" ? "repo:${var.github_owner}/${var.github_repo}:pull_request" : null,
    var.environment == "prod" ? "repo:${var.github_owner}/${var.github_repo}:ref:refs/heads/${var.github_branch}" : null,
  ])
}
