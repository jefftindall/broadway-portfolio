terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.12"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }

  # Backend blocks cannot use variables; keep this in sync with var.subscription_id.
  backend "azurerm" {
    subscription_id      = "e601e59a-c7f4-41f0-8178-b59740fb1974"
    resource_group_name  = "rg-elyse-tfstate"
    storage_account_name = "stelysetfstateeu2"
    container_name       = "tfstate"
    key                  = "broadway-portfolio/prod.tfstate"
  }
}

provider "azurerm" {
  subscription_id                 = var.subscription_id
  resource_provider_registrations = "none"
  resource_providers_to_register = [
    "Microsoft.Resources",
    "Microsoft.Storage",
    "Microsoft.KeyVault",
    "Microsoft.Web",
    "Microsoft.Authorization",
  ]

  features {
    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
  }
}

provider "azuread" {}

provider "github" {
  owner = var.github_owner
}

module "portfolio" {
  source = "../../modules/portfolio"

  environment               = "prod"
  location                  = var.location
  custom_domain             = var.custom_domain
  additional_auth_hostnames = var.additional_auth_hostnames
  github_owner              = var.github_owner
  github_repo               = var.github_repo
  github_branch             = var.github_branch
  manage_github_actions     = var.manage_github_actions
}

output "resource_group_name" {
  value = module.portfolio.resource_group_name
}

output "static_web_app_name" {
  value = module.portfolio.static_web_app_name
}

output "static_web_app_default_hostname" {
  value = module.portfolio.static_web_app_default_hostname
}

output "static_web_app_api_key" {
  value     = module.portfolio.static_web_app_api_key
  sensitive = true
}

output "key_vault_name" {
  value = module.portfolio.key_vault_name
}

output "key_vault_uri" {
  value = module.portfolio.key_vault_uri
}

output "custom_domain_validation_token" {
  value     = module.portfolio.custom_domain_validation_token
  sensitive = true
}

output "managed_identity_principal_id" {
  value = module.portfolio.managed_identity_principal_id
}

output "entra_application_id" {
  value = module.portfolio.entra_application_id
}

output "entra_tenant_id" {
  value = module.portfolio.entra_tenant_id
}

output "entra_openid_issuer" {
  value = module.portfolio.entra_openid_issuer
}

output "entra_redirect_uris" {
  value = module.portfolio.entra_redirect_uris
}

output "github_actions_client_id" {
  value = module.portfolio.github_actions_client_id
}

output "github_actions_tenant_id" {
  value = module.portfolio.github_actions_tenant_id
}

output "github_actions_subscription_id" {
  value = module.portfolio.github_actions_subscription_id
}

output "github_actions_oidc_subjects" {
  value = module.portfolio.github_actions_oidc_subjects
}
