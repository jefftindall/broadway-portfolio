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

variable "stripe_webhook_url_test" {
  type        = string
  description = "Known staging hostname for Stripe webhooks. Not an environment-stack output."
  default     = "https://test.elysetindall.com/api/stripeWebhook"
}

variable "stripe_webhook_url_live" {
  type        = string
  description = "Known production hostname for Stripe webhooks. Not an environment-stack output."
  default     = "https://elysetindall.com/api/stripeWebhook"
}

variable "stripe_payment_link_success_url_test" {
  type        = string
  description = "Where Stripe Payment Links return after a test-mode checkout."
  default     = "https://test.elysetindall.com/lessons/book"
}

variable "stripe_payment_link_success_url_live" {
  type        = string
  description = "Where Stripe Payment Links return after a live checkout."
  default     = "https://elysetindall.com/lessons/book"
}
