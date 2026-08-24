import { app } from '@azure/functions';
import { newCorrelationId } from '../lib/auth.js';
import { CrmConfigError, contactsStoreFromEnv } from '../lib/contacts.js';
import { tryLedgerStoreFromEnv } from '../lib/ledger.js';
import {
  applyStripeLedgerEvent,
  stripeEventTelemetry,
  stripeWebhookClient,
  verifyStripeWebhookEvent,
} from '../lib/stripeWebhook.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

app.http('stripeWebhook', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'stripeWebhook',
  handler: async (request) => {
    const correlationId = newCorrelationId();
    const signature =
      request.headers.get('stripe-signature') || request.headers.get('Stripe-Signature');

    let rawBody;
    try {
      rawBody = await request.text();
    } catch (err) {
      trackException(err, { correlationId, errorKind: 'body' });
      await flush();
      return { status: 400, jsonBody: { received: false, correlationId } };
    }

    const verified = verifyStripeWebhookEvent({
      rawBody,
      signature,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      stripe: stripeWebhookClient(process.env.STRIPE_SECRET_KEY),
    });

    if (!verified.ok) {
      trackEvent('StripeWebhookRejected', {
        correlationId,
        errorKind: verified.errorKind,
      });
      await flush();
      return {
        status: verified.status,
        jsonBody: { received: false, correlationId },
      };
    }

    let applyResult = { applied: false, matchKind: 'no_ledger' };
    try {
      const contacts = contactsStoreFromEnv();
      const ledger = tryLedgerStoreFromEnv(process.env, { contacts });
      applyResult = await applyStripeLedgerEvent(verified.event, ledger);
    } catch (err) {
      if (!(err instanceof CrmConfigError)) {
        trackException(err, {
          correlationId,
          errorKind: 'ledger',
          ...stripeEventTelemetry(verified.event),
        });
        trackEvent('StripeWebhookLedgerFailed', {
          correlationId,
          ...stripeEventTelemetry(verified.event),
        });
        await flush();
        return { status: 500, jsonBody: { received: false, correlationId } };
      }
    }

    trackEvent('StripeWebhookReceived', {
      correlationId,
      ...stripeEventTelemetry(verified.event, applyResult),
    });
    await flush();
    return { status: 200, jsonBody: { received: true, correlationId } };
  },
});
