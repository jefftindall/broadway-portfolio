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

output "shared_acs_email_name" {
  value = azurerm_email_communication_service.shared.name
}

output "contact_ciam_tenant_id" {
  description = "Entra External ID (CIAM) tenant GUID for student/parent sign-in"
  value       = local.contact_ciam_tenant_id_effective
}

output "contact_ciam_domain_prefix" {
  description = "CIAM login domain prefix ({prefix}.ciamlogin.com)"
  value       = local.contact_ciam_domain_prefix_effective
}

output "contact_ciam_oidc_issuer" {
  description = "OpenID issuer for SWA customOpenIdConnectProviders.contact"
  value       = local.contact_ciam_oidc_issuer
}

output "contact_ciam_tf_client_id" {
  description = "Entra app id for GitHub Actions Terraform in the CIAM tenant (kv-elyse-shared CONTACT-CIAM-TF-CLIENT-ID)"
  value       = try(azuread_application.terraform_ciam[0].client_id, "REPLACE_ME")
}
