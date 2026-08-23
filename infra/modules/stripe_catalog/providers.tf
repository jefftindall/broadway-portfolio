terraform {
  required_version = ">= 1.5.0"

  required_providers {
    stripe = {
      source  = "stripe/stripe"
      version = "~> 0.2.2"
    }
  }
}
