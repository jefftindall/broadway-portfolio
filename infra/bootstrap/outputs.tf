output "resource_group_name" {
  value = azurerm_resource_group.tfstate.name
}

output "storage_account_name" {
  value = azurerm_storage_account.tfstate.name
}

output "container_name" {
  value = azurerm_storage_container.tfstate.name
}

output "backend_config_staging" {
  description = "Values already set in infra/environments/staging/backend.tf"
  value = {
    resource_group_name  = azurerm_resource_group.tfstate.name
    storage_account_name = azurerm_storage_account.tfstate.name
    container_name       = azurerm_storage_container.tfstate.name
    key                  = "broadway-portfolio/staging.tfstate"
  }
}

output "backend_config_prod" {
  description = "Values already set in infra/environments/prod/backend.tf"
  value = {
    resource_group_name  = azurerm_resource_group.tfstate.name
    storage_account_name = azurerm_storage_account.tfstate.name
    container_name       = azurerm_storage_container.tfstate.name
    key                  = "broadway-portfolio/prod.tfstate"
  }
}

output "terraform_client_id" {
  description = "Entra application (client) ID for GitHub Actions Terraform OIDC"
  value       = azuread_application.terraform.client_id
}

output "terraform_tenant_id" {
  value = data.azurerm_client_config.current.tenant_id
}

output "terraform_subscription_id" {
  value = data.azurerm_client_config.current.subscription_id
}

output "terraform_oidc_subjects" {
  description = "Federated credential subjects expected by Entra for Terraform workflows"
  value = [
    "repo:${local.github_oidc_repo}:environment:staging",
    "repo:${local.github_oidc_repo}:environment:prod",
    "repo:${local.github_oidc_repo}:pull_request",
  ]
}

output "shared_key_vault_name" {
  description = "Foundational vault for site-build secrets shared by staging and prod"
  value       = azurerm_key_vault.shared.name
}

output "shared_key_vault_resource_group_name" {
  value = azurerm_resource_group.shared.name
}

output "shared_key_vault_uri" {
  value = azurerm_key_vault.shared.vault_uri
}

output "monitor_upn" {
  description = "Dedicated Studio smoke monitor UPN (password and TOTP seed are in kv-elyse-shared)"
  value       = azuread_user.monitor.user_principal_name
}

output "monitor_object_id" {
  value = azuread_user.monitor.object_id
}

output "shared_acs_name" {
  description = "Shared Communication Service (email + SMS) used by staging and prod"
  value       = azurerm_communication_service.shared.name
}

output "stripe_test_price_ids" {
  description = "Test-mode Stripe Price ids keyed by lesson rate id (empty until STRIPE-TEST-SECRET-KEY is populated)"
  value       = try(module.stripe_test[0].price_ids, {})
}

output "stripe_live_price_ids" {
  description = "Live-mode Stripe Price ids keyed by lesson rate id (empty until STRIPE-LIVE-SECRET-KEY is populated)"
  value       = try(module.stripe_live[0].price_ids, {})
}

output "shared_acs_email_name" {
  value = azurerm_email_communication_service.shared.name
}
