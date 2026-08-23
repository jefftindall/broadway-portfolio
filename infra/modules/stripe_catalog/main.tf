# Catalog + webhook for one Stripe mode (test or live). Prices are one-time
# (no recurring). Do not set payment_method_types or Stripe Tax here.

resource "stripe_product" "lesson" {
  for_each = var.rates

  name        = replace(each.value.label, " session", " voice lesson")
  description = "Private voice lesson (vocal pedagogy, vocal health, CCM)."
  metadata = {
    lesson_rate_id = each.key
  }
}

resource "stripe_price" "lesson" {
  for_each = var.rates

  product     = stripe_product.lesson[each.key].id
  currency    = "usd"
  unit_amount = each.value.cents
  nickname    = each.value.label
  metadata = {
    lesson_rate_id = each.key
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "stripe_webhook_endpoint" "lessons" {
  url         = var.webhook_url
  description = "Lesson payments (${var.mode}) — elysetindall.com"
  metadata = {
    purpose = "lesson-payments"
    mode    = var.mode
  }
  enabled_events = [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.expired",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "charge.refunded",
  ]
}
