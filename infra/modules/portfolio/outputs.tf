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
  description = "TXT record value for apex domain validation (when custom_domain is set)"
  value       = try(azurerm_static_web_app_custom_domain.apex[0].validation_token, null)
  sensitive   = true
}

output "www_custom_domain" {
  description = "www hostname bound when custom_domain is set (CNAME validation)"
  value       = try(azurerm_static_web_app_custom_domain.www[0].domain_name, null)
}

output "custom_hostname_validation_tokens" {
  description = "TXT record values for custom_hostnames (e.g. staging test.elysetindall.com)"
  value       = { for name, domain in azurerm_static_web_app_custom_domain.hostname : name => domain.validation_token }
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

output "contact_oidc_issuer" {
  description = "OpenID issuer for customOpenIdConnectProviders.contact (also in kv-elyse-shared CONTACT-CIAM-OIDC-ISSUER)"
  value       = trimspace(data.azurerm_key_vault_secret.contact_ciam_oidc_issuer.value)
}

output "contact_oidc_client_id" {
  description = "CIAM OIDC client ID written to env vault CONTACT-OIDC-CLIENT-ID"
  value       = try(azuread_application.contact_swa[0].client_id, data.azurerm_key_vault_secret.contact_oidc_client_id.value)
}

output "contact_ciam_tenant_id" {
  description = "Shared CIAM tenant GUID (kv-elyse-shared CONTACT-CIAM-TENANT-ID)"
  value       = trimspace(data.azurerm_key_vault_secret.contact_ciam_tenant_id.value)
}

output "entra_redirect_uris" {
  description = "Redirect URIs registered for this environment (Azure hostname + custom domains)"
  value       = local.redirect_uris
}

output "entra_monitor_token_scope" {
  description = "client_credentials scope for the Monitor.Ping app role"
  value       = "${local.monitor_identifier_uri}/.default"
}

output "monitor_upn" {
  description = "Studio smoke monitor UPN (assigned to this SWA app once the bootstrap user exists)"
  value       = local.monitor_upn
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
    "repo:${var.github_owner}@${var.github_owner_id}/${var.github_repo}@${var.github_repo_id}:environment:${var.environment}",
    var.environment == "staging" ? "repo:${var.github_owner}@${var.github_owner_id}/${var.github_repo}@${var.github_repo_id}:pull_request" : null,
    var.environment == "prod" ? "repo:${var.github_owner}@${var.github_owner_id}/${var.github_repo}@${var.github_repo_id}:ref:refs/heads/${var.github_branch}" : null,
  ])
}

output "application_insights_name" {
  value = azurerm_application_insights.main.name
}

output "application_insights_connection_string" {
  value     = azurerm_application_insights.main.connection_string
  sensitive = true
}

output "log_analytics_workspace_name" {
  value = azurerm_log_analytics_workspace.main.name
}

output "studio_crm_storage_account_name" {
  description = "Table Storage account for Studio CRM contacts (STUDIO-P1-001). Connection string stays in SWA app settings."
  value       = azurerm_storage_account.studio_crm.name
}
