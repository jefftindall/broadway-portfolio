variable "subscription_id" {
  type        = string
  description = "Azure subscription targeted by this Terraform stack"
  default     = "e601e59a-c7f4-41f0-8178-b59740fb1974"
}

variable "location" {
  type        = string
  description = "Azure region for Terraform remote state storage"
  default     = "eastus2"
}

variable "resource_group_name" {
  type        = string
  description = "Shared resource group for Terraform state"
  default     = "rg-elyse-tfstate"
}

variable "storage_account_name" {
  type        = string
  description = "Globally unique storage account name (3–24 lowercase alphanumeric)"
  default     = "stelysetfstateeu2"
}

variable "container_name" {
  type        = string
  description = "Blob container for environment state files"
  default     = "tfstate"
}

variable "tags" {
  type = map(string)
  default = {
    project = "elyse-tindall-portfolio"
    purpose = "terraform-remote-state"
    managed = "terraform"
  }
}

variable "github_owner" {
  type        = string
  description = "GitHub org or user that owns the portfolio repo"
  default     = "jefftindall"
}

variable "github_owner_id" {
  type        = string
  description = "Numeric GitHub owner ID used in OIDC subject claims"
  default     = "10339968"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository name"
  default     = "broadway-portfolio"
}

variable "github_repo_id" {
  type        = string
  description = "Numeric GitHub repository ID used in OIDC subject claims"
  default     = "1312787625"
}

variable "manage_github_actions" {
  type        = bool
  description = "When true, set repo-level AZURE_TF_* Actions variables (requires GH_TOKEN)"
  default     = true
}

variable "monitor_upn" {
  type        = string
  description = "UPN for the dedicated Studio smoke monitor user. Empty uses studio-monitor@<initial tenant domain>."
  default     = ""
}

variable "manage_contact_ciam_tenant" {
  type        = bool
  description = "When true, create the shared Entra External ID (CIAM) tenant via azapi. Set false after the tenant exists to avoid recreate churn."
  default     = true
}

variable "contact_ciam_domain_prefix" {
  type        = string
  description = "CIAM tenant domain prefix (becomes {prefix}.ciamlogin.com). Must be globally unique."
  default     = "elysecontacts"

  validation {
    condition     = can(regex("^[a-z0-9-]{3,24}$", var.contact_ciam_domain_prefix))
    error_message = "contact_ciam_domain_prefix must be 3–24 lowercase alphanumeric characters or hyphens."
  }
}

variable "contact_ciam_display_name" {
  type        = string
  description = "Display name for the CIAM tenant in Entra admin center"
  default     = "Elyse Tindall Contact Accounts"
}

variable "contact_ciam_country_code" {
  type        = string
  description = "ISO 3166 country code for CIAM tenant creation"
  default     = "US"
}

variable "contact_ciam_location" {
  type        = string
  description = "Azure region label for CIAM directory resource (Microsoft.AzureActiveDirectory/ciamDirectories location)"
  default     = "United States"
}

variable "contact_ciam_tenant_id" {
  type        = string
  description = "When manage_contact_ciam_tenant is false, optionally set the existing CIAM tenant GUID for shared Key Vault metadata (CONTACT-CIAM-* secrets)."
  default     = ""
}

variable "manage_contact_ciam_gha" {
  type        = bool
  description = "When true and the CIAM tenant exists, register elyse-portfolio-gha-ciam-terraform (GitHub OIDC + Application Administrator) in that tenant."
  default     = true
}
