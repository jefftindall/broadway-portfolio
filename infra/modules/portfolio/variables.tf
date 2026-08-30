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

variable "custom_hostnames" {
  type        = list(string)
  description = "Non-apex hostnames to bind with TXT validation (e.g. staging test.elysetindall.com). Do not include the apex or www — those come from custom_domain. Empty on prod."
  default     = []

  validation {
    condition     = length(var.custom_hostnames) == length(toset(var.custom_hostnames))
    error_message = "custom_hostnames must not contain duplicates."
  }

  validation {
    condition = alltrue([
      for host in var.custom_hostnames : can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", host))
    ])
    error_message = "custom_hostnames must be lowercase FQDNs (e.g. test.elysetindall.com)."
  }
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
  description = "Base git branch for Studio (catalog reads + direct publish). Staging SWA uses STUDIO_PUBLISH_MODE=pr to commit to staging-studio-YYYYMMDD instead."
  default     = "main"
}

variable "studio_publish_mode" {
  type        = string
  description = "Studio publish target: \"direct\" commits to github_branch; \"pr\" commits to staging-studio-YYYYMMDD and opens/updates a PR into github_branch."
  default     = ""

  validation {
    condition     = var.studio_publish_mode == "" || contains(["direct", "pr"], var.studio_publish_mode)
    error_message = "studio_publish_mode must be \"\", \"direct\", or \"pr\"."
  }
}

variable "gemini_model" {
  type        = string
  description = "Gemini model ID used by Studio publish (override without redeploying API code)"
  default     = "gemini-3.6-flash"
}

variable "ga_measurement_id" {
  type        = string
  description = "Google Analytics 4 Measurement ID embedded in the Astro client bundle (public-by-design). Published as GitHub Environment variable GA_MEASUREMENT_ID → PUBLIC_GA_MEASUREMENT_ID at build time."
  default     = "G-XEE29C0RRE"

  validation {
    condition     = can(regex("^G-[A-Z0-9]+$", var.ga_measurement_id))
    error_message = "ga_measurement_id must look like a GA4 Measurement ID (e.g. G-XEE29C0RRE)."
  }
}

variable "lesson_payments_enabled" {
  type        = bool
  description = "When true, GET /api/lessonPayConfig may return Stripe Payment Links so /lessons/book can show pay CTAs. Staging should be true (test mode); prod stays false until go-live. Not baked into the shared Astro artifact."
}

variable "contact_accounts_enabled" {
  type        = bool
  description = "When true, GET /api/contactAccountConfig returns enabled and public header may show student Sign in / Account. Staging default true; prod false until go-live. Independent of lesson_payments_enabled."
}

variable "manage_contact_oidc_app" {
  type        = bool
  description = "When true and CONTACT-CIAM-TENANT-ID is populated in kv-elyse-shared, create the CIAM OIDC app registration and write CONTACT-OIDC-* secrets."
  default     = true
}

variable "additional_auth_hostnames" {
  type        = list(string)
  description = "Extra hostnames allowed to complete Entra sign-in (e.g. www.elysetindall.com)"
  default     = []
}

variable "require_app_role_assignment" {
  type        = bool
  description = "When true, Entra blocks sign-in unless the user (or a group) is assigned to the enterprise app (AADSTS50105). Default false: any user who can authenticate to this tenant may sign in. This is not authorization — Studio APIs must still enforce the permission catalog (profiles; ALLOWED-USER-IDS only bootstraps a missing Owner). Do not turn this on to 'secure' publish or People."
  default     = false
}

variable "monitor_upn" {
  type        = string
  description = "UPN of the bootstrap Studio smoke monitor user. Empty uses studio-monitor@<initial tenant domain>."
  default     = ""
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

variable "purge_protection_enabled" {
  type        = bool
  description = "Enable Key Vault purge protection (cannot be turned off while retention remains). Enable for prod (OPS-P3-006); leave false on staging."
  default     = false
}

variable "soft_delete_retention_days" {
  type        = number
  description = "Key Vault soft-delete retention (7–90). Immutable after vault create — keep aligned with the live vault."
  default     = 7

  validation {
    condition     = var.soft_delete_retention_days >= 7 && var.soft_delete_retention_days <= 90
    error_message = "soft_delete_retention_days must be between 7 and 90."
  }
}

variable "shared_key_vault_name" {
  type        = string
  description = "Bootstrap foundational Key Vault for SITE-*, Turnstile, ACS, and ALERT-* ops contacts (shared by staging/prod)"
  default     = "kv-elyse-shared"
}

variable "shared_key_vault_resource_group_name" {
  type        = string
  description = "Resource group of the shared foundational Key Vault"
  default     = "rg-elyse-shared"
}

variable "tags" {
  type        = map(string)
  description = "Additional resource tags"
  default     = {}
}
