import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';
import {
  stripeEventTelemetry,
  stripeWebhookClient,
  verifyStripeWebhookEvent,
} from './stripeWebhook.js';

const secret = 'whsec_test_secret';
const stripe = stripeWebhookClient('sk_test_not_used');

function signedPayload(event) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  return { payload, signature };
}

test('verifyStripeWebhookEvent accepts a valid signature', () => {
  const event = {
    id: 'evt_test_webhook',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_should_not_leak_into_telemetry' } },
  };
  const { payload, signature } = signedPayload(event);
  const result = verifyStripeWebhookEvent({
    rawBody: payload,
    signature,
    webhookSecret: secret,
    stripe,
  });
  assert.equal(result.ok, true);
  assert.equal(result.event.id, 'evt_test_webhook');
  assert.equal(result.event.type, 'checkout.session.completed');
});

test('verifyStripeWebhookEvent rejects a bad signature without leaking the body', () => {
  const result = verifyStripeWebhookEvent({
    rawBody: JSON.stringify({ id: 'evt_x', object: 'event', type: 'ping' }),
    signature: 't=1,v1=deadbeef',
    webhookSecret: secret,
    stripe,
  });
  assert.deepEqual(result, { ok: false, status: 400, errorKind: 'signature' });
});

test('verifyStripeWebhookEvent returns 503 when the signing secret is missing', () => {
  const result = verifyStripeWebhookEvent({
    rawBody: '{}',
    signature: 't=1,v1=x',
    webhookSecret: 'REPLACE_ME',
    stripe,
  });
  assert.deepEqual(result, { ok: false, status: 503, errorKind: 'config' });
});

test('stripeEventTelemetry is event id and type only', () => {
  const telemetry = stripeEventTelemetry({
    id: 'evt_abc',
    type: 'charge.refunded',
    data: { object: { customer_email: 'student@example.com' } },
  });
  assert.deepEqual(telemetry, { eventId: 'evt_abc', eventType: 'charge.refunded' });
  assert.equal(JSON.stringify(telemetry).includes('student@'), false);
});

test('generateTestHeaderString round-trips through Stripe SDK', () => {
  const payload = '{"id":"evt_roundtrip","object":"event","type":"ping"}';
  const header = new Stripe('sk_test_x').webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  const event = new Stripe('sk_test_x').webhooks.constructEvent(payload, header, secret);
  assert.equal(event.id, 'evt_roundtrip');
});
