import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';
import { createContactsStore, MemoryTableClient } from './contacts.js';
import { createLedgerStore } from './ledger.js';
import {
  applyStripeLedgerEvent,
  extractStripeLedgerInput,
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

test('extractStripeLedgerInput reads checkout and refund without requiring a Stripe retrieve', () => {
  const session = extractStripeLedgerInput({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        payment_status: 'paid',
        amount_total: 6000,
        currency: 'usd',
        customer_details: { email: 'ada@example.com' },
        payment_intent: 'pi_test_1',
        created: 1755907200,
      },
    },
  });
  assert.equal(session.kind, 'payment');
  assert.equal(session.id, 'pi_test_1');
  assert.equal(session.amountCents, 6000);
  assert.equal(session.email, 'ada@example.com');

  const unpaid = extractStripeLedgerInput({
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_x', payment_status: 'unpaid', amount_total: 6000 } },
  });
  assert.equal(unpaid.kind, 'ignore');

  const refund = extractStripeLedgerInput({
    type: 'charge.refunded',
    data: {
      object: {
        id: 'ch_1',
        payment_intent: 'pi_test_1',
        amount_refunded: 2000,
        billing_details: { email: 'ada@example.com' },
      },
    },
  });
  assert.equal(refund.kind, 'refund');
  assert.equal(refund.refundedCents, 2000);
  assert.equal(refund.paymentIntentId, 'pi_test_1');
});

test('applyStripeLedgerEvent matches a student and does not drop unmatched charges', async () => {
  const table = new MemoryTableClient();
  const contacts = createContactsStore({ tableClient: table });
  const ledger = createLedgerStore({ tableClient: table, contacts });
  const student = await contacts.create({
    displayName: 'Ada',
    email: 'ada@example.com',
    personas: ['student'],
  });

  const paid = await applyStripeLedgerEvent(
    {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_ada',
          amount_received: 10000,
          currency: 'usd',
          receipt_email: 'ada@example.com',
          created: 1755907200,
        },
      },
    },
    ledger,
  );
  assert.equal(paid.matchKind, 'matched');
  assert.equal(paid.contactId, student.id);
  assert.equal((await contacts.get(student.id)).studentLtvCents, 10000);

  const orphan = await applyStripeLedgerEvent(
    {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_orphan',
          payment_status: 'paid',
          amount_total: 6000,
          currency: 'usd',
          customer_email: 'nobody@example.com',
          payment_intent: 'pi_orphan',
        },
      },
    },
    ledger,
  );
  assert.equal(orphan.matchKind, 'unmatched');
  assert.equal((await ledger.listUnmatched()).length, 1);
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
