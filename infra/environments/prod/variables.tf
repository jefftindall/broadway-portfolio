variable "subscription_id" {
  type        = string
  description = "Azure subscription targeted by this Terraform stack"
  default     = "e601e59a-c7f4-41f0-8178-b59740fb1974"
}

variable "location" {
  type        = string
  description = "Azure region for all resources"
  default     = "eastus2"
}

variable "custom_domain" {
  type        = string
  description = "Production custom domain"
  default     = "elysetindall.com"
}

variable "additional_auth_hostnames" {
  type        = list(string)
  description = "Extra hostnames allowed to complete Entra sign-in (Azure SWA hostname is added automatically)"
  default     = ["www.elysetindall.com"]
}

variable "github_owner" {
  type        = string
  description = "GitHub org or user that owns the portfolio repo"
  default     = "jefftindall"
}

variable "github_repo" {
  type    = string
  default = "broadway-portfolio"
}

variable "github_branch" {
  type        = string
  description = "Branch Studio commits to / prod deploys from"
  default     = "main"
}

variable "manage_github_actions" {
  type        = bool
  description = "Create GitHub Actions environment variables via Terraform (needs GITHUB_TOKEN/GH_TOKEN)"
  default     = true
}
