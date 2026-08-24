import { app } from '@azure/functions';
import { forbidden, newCorrelationId, publisherIdentity, signInRequired } from '../lib/auth.js';
import { contactsStoreFromEnv } from '../lib/contacts.js';
import { crmFailureResponse } from '../lib/httpErrors.js';
import { ledgerStoreFromEnv } from '../lib/ledger.js';
import { PERMISSION, permissionGate } from '../lib/studioAccess.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

async function requirePeopleWrite(request, correlationId) {
  const gate = await permissionGate(request, PERMISSION.PEOPLE_WRITE);
  if (!gate.signedIn) return { error: signInRequired(correlationId) };
  if (!gate.allowed) {
    const identity = publisherIdentity(gate.principal);
    trackEvent('StudioAccessDenied', {
      ...identity,
      correlationId,
      route: 'offlinePayments',
      permission: PERMISSION.PEOPLE_WRITE,
    });
    await flush();
    return {
      error: forbidden(correlationId, 'This account is signed in but cannot edit People.'),
    };
  }
  return { access: gate.access };
}

async function fail(err, { context, correlationId, operation, contactId }) {
  const failure = crmFailureResponse(err, correlationId);
  context.warn('Studio CRM failed', {
    correlationId,
    operation,
    errorKind: failure.errorKind,
    ...(contactId ? { contactId } : {}),
  });
  if (failure.status >= 500) {
    trackException(err, {
      correlationId,
      operation,
      errorKind: failure.errorKind,
      ...(contactId ? { contactId } : {}),
    });
  }
  trackEvent('StudioCrmFailed', {
    correlationId,
    operation,
    errorKind: failure.errorKind,
    ...(contactId ? { contactId } : {}),
  });
  await flush();
  return {
    status: failure.status,
    headers: jsonHeaders(),
    jsonBody: failure.jsonBody,
  };
}

app.http('offlinePayments', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'contacts/{id}/offlinePayments',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const contactId = request.params?.id;
    const authed = await requirePeopleWrite(request, correlationId);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };
    try {
      const contacts = contactsStoreFromEnv();
      const ledger = ledgerStoreFromEnv(process.env, { contacts });
      const body = await request.json();
      const payment = await ledger.addOfflinePayment(contactId, body || {});
      const contact = await contacts.get(contactId);
      trackEvent('StudioCrmOp', {
        correlationId,
        operation: 'offline_create',
        contactId,
        paymentId: payment.id,
      });
      await flush();
      return {
        status: 201,
        headers: jsonHeaders(),
        jsonBody: { payment, contact, correlationId },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation: 'offline_create', contactId });
    }
  },
});

app.http('offlinePaymentById', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'contacts/{id}/offlinePayments/{paymentId}',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const contactId = request.params?.id;
    const paymentId = request.params?.paymentId;
    const authed = await requirePeopleWrite(request, correlationId);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };
    try {
      const contacts = contactsStoreFromEnv();
      const ledger = ledgerStoreFromEnv(process.env, { contacts });
      await ledger.removeOfflinePayment(contactId, paymentId);
      const contact = await contacts.get(contactId);
      trackEvent('StudioCrmOp', {
        correlationId,
        operation: 'offline_delete',
        contactId,
        paymentId,
      });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: { removed: true, contact, correlationId },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation: 'offline_delete', contactId });
    }
  },
});
