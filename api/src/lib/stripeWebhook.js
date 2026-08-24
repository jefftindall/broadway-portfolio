import Stripe from 'stripe';
import { normalizeEmail } from './contacts.js';
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
export function stripeEventTelemetry(event, extra = {}) {
  const out = {
    eventId: event.id,
    eventType: event.type,
  };
  if (extra.matchKind) out.matchKind = extra.matchKind;
  if (extra.paymentId) out.paymentId = extra.paymentId;
  if (extra.contactId) out.contactId = extra.contactId;
  if (extra.applied !== undefined) out.applied = extra.applied ? 'true' : 'false';
  return out;
}

function firstEmail(...candidates) {
  for (const raw of candidates) {
    const text = String(raw || '').trim();
    if (!text || !normalizeEmail(text)) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) continue;
    return text;
  }
  return '';
}

function unixToDay(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return new Date(n * 1000).toISOString().slice(0, 10);
}

function objectId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.id) return String(value.id);
  return '';
}

function chargeFromPaymentIntent(intent) {
  const data = intent?.charges?.data;
  if (Array.isArray(data) && data[0]) return data[0];
  const latest = intent?.latest_charge;
  if (latest && typeof latest === 'object') return latest;
  return null;
}

/**
 * Pull ledger fields from a verified Stripe event. No PII is required by callers
 * beyond the email used for matching — never log the return value.
 */
export function extractStripeLedgerInput(event) {
  const type = String(event?.type || '');
  const obj = event?.data?.object || {};

  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
    const paid =
      type === 'checkout.session.async_payment_succeeded' ||
      obj.payment_status === 'paid' ||
      obj.status === 'complete';
    if (!paid) return { kind: 'ignore', reason: 'unpaid_session' };
    const paymentIntentId = objectId(obj.payment_intent);
    const sessionId = objectId(obj.id) || '';
    const id = paymentIntentId || sessionId;
    if (!id) return { kind: 'ignore', reason: 'missing_id' };
    return {
      kind: 'payment',
      id,
      amountCents: Number(obj.amount_total) || 0,
      refundedCents: 0,
      currency: String(obj.currency || 'usd'),
      email: firstEmail(obj.customer_details?.email, obj.customer_email),
      paidOn: unixToDay(obj.created),
      stripePaymentIntentId: paymentIntentId,
      stripeSessionId: sessionId,
    };
  }

  if (type === 'payment_intent.succeeded') {
    const charge = chargeFromPaymentIntent(obj);
    const paymentIntentId = objectId(obj.id);
    if (!paymentIntentId) return { kind: 'ignore', reason: 'missing_id' };
    return {
      kind: 'payment',
      id: paymentIntentId,
      amountCents: Number(obj.amount_received ?? obj.amount) || 0,
      refundedCents: Number(charge?.amount_refunded) || 0,
      currency: String(obj.currency || 'usd'),
      email: firstEmail(
        obj.receipt_email,
        charge?.billing_details?.email,
        charge?.receipt_email,
      ),
      paidOn: unixToDay(obj.created),
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: objectId(charge?.id) || objectId(obj.latest_charge),
    };
  }

  if (type === 'charge.refunded') {
    const paymentIntentId = objectId(obj.payment_intent);
    const chargeId = objectId(obj.id);
    return {
      kind: 'refund',
      id: paymentIntentId || chargeId,
      paymentIntentId,
      chargeId,
      refundedCents: Number(obj.amount_refunded) || 0,
      email: firstEmail(obj.billing_details?.email, obj.receipt_email),
    };
  }

  return { kind: 'ignore', reason: 'unhandled_type' };
}

/**
 * Apply a verified Stripe event to the Studio ledger and contact LTV rollup.
 * @returns {Promise<{ applied: boolean, matchKind: string, paymentId?: string, contactId?: string }>}
 */
export async function applyStripeLedgerEvent(event, ledger) {
  if (!ledger) return { applied: false, matchKind: 'no_ledger' };
  const extracted = extractStripeLedgerInput(event);
  if (!extracted || extracted.kind === 'ignore') {
    return { applied: false, matchKind: extracted?.reason || 'ignored' };
  }
  if (extracted.kind === 'refund') {
    return ledger.applyStripeRefund(extracted);
  }
  return ledger.upsertStripePayment(extracted);
}
