import { app } from '@azure/functions';
import {
  getClientPrincipal,
  isSignedInStudioUser,
  newCorrelationId,
  signInRequired,
  studioOwnerKey,
} from '../lib/auth.js';
import { contactsStoreFromEnv } from '../lib/contacts.js';
import { crmFailureResponse } from '../lib/httpErrors.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

function flagEnabled(value) {
  return /^(1|true|yes)$/i.test(String(value || '').trim());
}

function readStore() {
  return contactsStoreFromEnv();
}

function crmLog(context, message, { correlationId, operation, contactId, errorKind }) {
  context.warn(message, {
    correlationId,
    operation,
    errorKind,
    ...(contactId ? { contactId } : {}),
  });
}

async function requireOwner(request, correlationId) {
  const principal = getClientPrincipal(request);
  if (!isSignedInStudioUser(principal)) {
    return { error: signInRequired(correlationId) };
  }
  return { ownerKey: studioOwnerKey(principal) };
}

async function fail(err, { context, correlationId, operation, contactId }) {
  const failure = crmFailureResponse(err, correlationId);
  crmLog(context, 'Studio CRM failed', {
    correlationId,
    operation,
    contactId,
    errorKind: failure.errorKind,
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

app.http('contacts', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'contacts',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const authed = await requireOwner(request, correlationId);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };

    const operation = request.method === 'POST' ? 'create' : 'list';
    try {
      const store = readStore();
      if (request.method === 'GET') {
        const url = new URL(request.url);
        const format = String(url.searchParams.get('format') || '').toLowerCase();
        const includeArchived = flagEnabled(url.searchParams.get('includeArchived'));
        if (format === 'csv') {
          const csv = await store.exportCsv(authed.ownerKey, { includeArchived });
          trackEvent('StudioCrmOp', { correlationId, operation: 'export' });
          await flush();
          return {
            status: 200,
            headers: {
              ...jsonHeaders(),
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': 'attachment; filename="studio-people.csv"',
            },
            body: csv,
          };
        }
        const contacts = await store.list(authed.ownerKey, {
          q: url.searchParams.get('q') || '',
          persona: url.searchParams.get('persona') || '',
          includeArchived,
        });
        trackEvent('StudioCrmOp', { correlationId, operation: 'list' });
        await flush();
        return {
          status: 200,
          headers: jsonHeaders(),
          jsonBody: { contacts, correlationId },
        };
      }

      const body = await request.json();
      const contact = await store.create(authed.ownerKey, body || {});
      trackEvent('StudioCrmOp', { correlationId, operation: 'create', contactId: contact.id });
      await flush();
      return {
        status: 201,
        headers: jsonHeaders(),
        jsonBody: { contact, correlationId },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation });
    }
  },
});

app.http('contactById', {
  methods: ['GET', 'PATCH'],
  authLevel: 'anonymous',
  route: 'contacts/{id}',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const contactId = request.params?.id;
    const authed = await requireOwner(request, correlationId);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };

    const operation = request.method === 'PATCH' ? 'update' : 'get';
    try {
      const store = readStore();
      if (request.method === 'GET') {
        const contact = await store.get(authed.ownerKey, contactId);
        trackEvent('StudioCrmOp', { correlationId, operation: 'get', contactId });
        await flush();
        return {
          status: 200,
          headers: jsonHeaders(),
          jsonBody: { contact, correlationId },
        };
      }

      const body = await request.json();
      const etag = request.headers.get('if-match') || body?.etag || '';
      const contact = await store.update(authed.ownerKey, contactId, body || {}, { etag });
      trackEvent('StudioCrmOp', { correlationId, operation: 'update', contactId });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: { contact, correlationId },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation, contactId });
    }
  },
});
