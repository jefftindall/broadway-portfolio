import Stripe from 'stripe';
import { isUsableSecret } from './lessonPayConfig.js';

/** Event types we subscribe to in bootstrap stripe_webhook_endpoint. */
export const STRIPE_WEBHOOK_EVENT_TYPES = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.expired',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
];

/**
 * Stripe webhook verification does not call the API; a placeholder key is enough
 * when only constructEvent is used.
 */
export function stripeWebhookClient(secretKey) {
  const key = isUsableSecret(secretKey) ? secretKey : 'sk_test_webhook_verify_only';
  return new Stripe(key);
}

/**
 * @param {{ rawBody: string, signature: string | null | undefined, webhookSecret: string | undefined, stripe?: import('stripe').default }} input
 * @returns {{ ok: true, event: import('stripe').Stripe.Event } | { ok: false, status: number, errorKind: string }}
 */
export function verifyStripeWebhookEvent({
  rawBody,
  signature,
  webhookSecret,
  stripe = stripeWebhookClient(process.env.STRIPE_SECRET_KEY),
}) {
  if (!isUsableSecret(webhookSecret)) {
    return { ok: false, status: 503, errorKind: 'config' };
  }
  if (!signature || typeof rawBody !== 'string') {
    return { ok: false, status: 400, errorKind: 'signature' };
  }
  try {
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    return { ok: true, event };
  } catch {
    return { ok: false, status: 400, errorKind: 'signature' };
  }
}

/**
 * Safe App Insights properties — event id + type only (no payload, PII, or secrets).
 * @param {import('stripe').Stripe.Event} event
 */
export function stripeEventTelemetry(event) {
  return {
    eventId: event.id,
    eventType: event.type,
  };
}
