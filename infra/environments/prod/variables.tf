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

variable "github_owner_id" {
  type        = string
  description = "Numeric GitHub owner ID for OIDC subject claims"
  default     = "10339968"
}

variable "github_repo" {
  type    = string
  default = "broadway-portfolio"
}

variable "github_repo_id" {
  type        = string
  description = "Numeric GitHub repository ID for OIDC subject claims"
  default     = "1312787625"
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

variable "ga_measurement_id" {
  type        = string
  description = "GA4 Measurement ID for Astro builds (GitHub env var GA_MEASUREMENT_ID)"
  default     = "G-XEE29C0RRE"
}

variable "monitor_upn" {
  type        = string
  description = "UPN of the bootstrap Studio smoke monitor user. Empty uses studio-monitor@<initial tenant domain>. Must match infra/bootstrap."
  default     = ""
}

variable "lesson_payments_enabled" {
  type        = bool
  description = "Show Stripe pay CTAs on /lessons/book via GET /api/lessonPayConfig. Prod stays false until go-live (`terraform apply -var='lesson_payments_enabled=true'`)."
  default     = false
}

