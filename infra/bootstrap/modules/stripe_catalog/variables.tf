variable "rates" {
  type = map(object({
    label = string
    cents = number
  }))
  description = "Lesson rate id → advertised label and Stripe unit_amount (USD cents)."
}

variable "webhook_url" {
  type        = string
  description = "Public HTTPS URL for POST /api/stripeWebhook (known hostname, not an env-stack output)."
}

variable "mode" {
  type        = string
  description = "Stripe mode label for descriptions (test or live)."

  validation {
    condition     = contains(["test", "live"], var.mode)
    error_message = "mode must be \"test\" or \"live\"."
  }
}
