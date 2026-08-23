output "webhook_secret" {
  description = "Signing secret for POST /api/stripeWebhook. Only populated at webhook creation."
  value       = stripe_webhook_endpoint.lessons.secret
  sensitive   = true
}

output "price_ids" {
  description = "lesson_rate_id → Stripe Price id (price_…)"
  value       = { for id, price in stripe_price.lesson : id => price.id }
}

output "product_ids" {
  description = "lesson_rate_id → Stripe Product id (prod_…)"
  value       = { for id, product in stripe_product.lesson : id => product.id }
}
