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
