import { app } from '@azure/functions';
import { forbidden, newCorrelationId, publisherIdentity, signInRequired } from '../lib/auth.js';
import { contactsStoreFromEnv } from '../lib/contacts.js';
import { crmFailureResponse } from '../lib/httpErrors.js';
import { ledgerStoreFromEnv } from '../lib/ledger.js';
import { studioLessonPayLinksFromEnv } from '../lib/lessonPayConfig.js';
import { PERMISSION, permissionGate } from '../lib/studioAccess.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

async function requirePeople(request, correlationId, permission) {
  const gate = await permissionGate(request, permission);
  if (!gate.signedIn) return { error: signInRequired(correlationId) };
  if (!gate.allowed) {
    const identity = publisherIdentity(gate.principal);
    trackEvent('StudioAccessDenied', {
      ...identity,
      correlationId,
      route: 'unmatchedPayments',
      permission,
    });
    await flush();
    const error =
      permission === PERMISSION.PEOPLE_WRITE
        ? 'This account is signed in but cannot edit People.'
        : 'This account is signed in but cannot view People.';
    return { error: forbidden(correlationId, error) };
  }
  return { access: gate.access };
}

async function fail(err, { context, correlationId, operation, paymentId }) {
  const failure = crmFailureResponse(err, correlationId);
  context.warn('Studio CRM failed', {
    correlationId,
    operation,
    errorKind: failure.errorKind,
    ...(paymentId ? { paymentId } : {}),
  });
  if (failure.status >= 500) {
    trackException(err, {
      correlationId,
      operation,
      errorKind: failure.errorKind,
      ...(paymentId ? { paymentId } : {}),
    });
  }
  trackEvent('StudioCrmFailed', {
    correlationId,
    operation,
    errorKind: failure.errorKind,
    ...(paymentId ? { paymentId } : {}),
  });
  await flush();
  return {
    status: failure.status,
    headers: jsonHeaders(),
    jsonBody: failure.jsonBody,
  };
}

app.http('unmatchedPayments', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'unmatchedPayments',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const authed = await requirePeople(request, correlationId, PERMISSION.PEOPLE_READ);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };
    try {
      const contacts = contactsStoreFromEnv();
      const ledger = ledgerStoreFromEnv(process.env, { contacts });
      const payments = await ledger.listUnmatched();
      trackEvent('StudioCrmOp', {
        correlationId,
        operation: 'unmatched_list',
        count: payments.length,
      });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: {
          payments,
          payLinks: studioLessonPayLinksFromEnv(),
          correlationId,
        },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation: 'unmatched_list' });
    }
  },
});

app.http('unmatchedPaymentAssign', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'unmatchedPayments/{id}/assign',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const paymentId = request.params?.id;
    const authed = await requirePeople(request, correlationId, PERMISSION.PEOPLE_WRITE);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };
    try {
      const body = await request.json();
      const contactId = String(body?.contactId || '').trim();
      const contacts = contactsStoreFromEnv();
      const ledger = ledgerStoreFromEnv(process.env, { contacts });
      const payment = await ledger.assignStripePayment(paymentId, contactId);
      const contact = await contacts.get(contactId);
      trackEvent('StudioCrmOp', {
        correlationId,
        operation: 'unmatched_assign',
        paymentId,
        contactId,
      });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: { payment, contact, correlationId },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation: 'unmatched_assign', paymentId });
    }
  },
});
