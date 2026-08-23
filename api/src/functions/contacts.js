import { app } from '@azure/functions';
import {
  forbidden,
  newCorrelationId,
  publisherIdentity,
  signInRequired,
} from '../lib/auth.js';
import { contactsStoreFromEnv } from '../lib/contacts.js';
import { crmFailureResponse } from '../lib/httpErrors.js';
import { PERMISSION, permissionGate } from '../lib/studioAccess.js';
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

async function requirePeople(request, correlationId, permission) {
  const gate = await permissionGate(request, permission);
  if (!gate.signedIn) {
    return { error: signInRequired(correlationId) };
  }
  if (!gate.allowed) {
    const identity = publisherIdentity(gate.principal);
    trackEvent('StudioAccessDenied', {
      ...identity,
      correlationId,
      route: 'contacts',
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
    const permission = request.method === 'POST' ? PERMISSION.PEOPLE_WRITE : PERMISSION.PEOPLE_READ;
    const authed = await requirePeople(request, correlationId, permission);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };

    const operation = request.method === 'POST' ? 'create' : 'list';
    try {
      const store = readStore();
      if (request.method === 'GET') {
        const url = new URL(request.url);
        const includeArchived = flagEnabled(url.searchParams.get('includeArchived'));
        const directory = flagEnabled(url.searchParams.get('directory'));
        const listed = await store.list({
          q: url.searchParams.get('q') || '',
          persona: url.searchParams.get('persona') || '',
          includeArchived,
          directory,
          page: url.searchParams.get('page') || 1,
          pageSize: url.searchParams.get('pageSize') || undefined,
        });
        trackEvent('StudioCrmOp', { correlationId, operation: directory ? 'directory' : 'list' });
        await flush();
        return {
          status: 200,
          headers: jsonHeaders(),
          jsonBody: { ...listed, correlationId },
        };
      }

      const body = await request.json();
      const contact = await store.create(body || {});
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
    const permission = request.method === 'PATCH' ? PERMISSION.PEOPLE_WRITE : PERMISSION.PEOPLE_READ;
    const authed = await requirePeople(request, correlationId, permission);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };

    const operation = request.method === 'PATCH' ? 'update' : 'get';
    try {
      const store = readStore();
      if (request.method === 'GET') {
        const contact = await store.get(contactId);
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
      const contact = await store.update(contactId, body || {}, { etag });
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
