variable "environment" {
  type        = string
  description = "Environment name included in all resource names (e.g. staging, prod)"

  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "environment must be \"staging\" or \"prod\"."
  }
}

variable "location" {
  type        = string
  description = "Azure region for all resources in this environment"
  default     = "eastus2"
}

variable "custom_domain" {
  type        = string
  description = "Apex custom domain (empty to skip). Typically set only on prod."
  default     = ""
}

variable "github_owner" {
  type        = string
  description = "GitHub org or user that owns the portfolio repo"
  default     = "jefftindall"
}

variable "github_owner_id" {
  type        = string
  description = "Numeric GitHub owner ID used in OIDC subject claims (from gh api /repos/...)"
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

variable "github_branch" {
  type        = string
  description = "Branch Studio commits to"
  default     = "main"
}

variable "additional_auth_hostnames" {
  type        = list(string)
  description = "Extra hostnames allowed to complete Entra sign-in (e.g. www.elysetindall.com)"
  default     = []
}

variable "require_app_role_assignment" {
  type        = bool
  description = "Require explicit Entra app assignment to sign in (extra lockdown on top of the API allowlist)"
  default     = true
}

variable "entra_secret_lifetime" {
  type        = string
  description = "How long each generated client secret stays valid (timeadd duration)"
  default     = "8760h"
}

variable "entra_secret_rotation_days" {
  type        = number
  description = "Days before Terraform generates a replacement client secret; keep below the lifetime so rotation happens ahead of expiry"
  default     = 300
}

variable "manage_github_actions" {
  type        = bool
  description = "When true, Terraform creates the GitHub Actions environment and OIDC-related variables (requires GitHub provider auth via GITHUB_TOKEN/GH_TOKEN)"
  default     = true
}

variable "tags" {
  type        = map(string)
  description = "Additional resource tags"
  default     = {}
}
