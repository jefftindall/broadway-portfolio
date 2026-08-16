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
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Local state only — this stack creates the remote backend used by staging/prod.
  backend "local" {
    path = "terraform.tfstate"
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
    "Microsoft.Communication",
    "Microsoft.Consumption",
    "Microsoft.CostManagement",
  ]
  features {}
}

provider "azuread" {}

provider "github" {
  owner = var.github_owner
}
