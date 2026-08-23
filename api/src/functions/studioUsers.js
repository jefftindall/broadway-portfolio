import { app } from '@azure/functions';
import {
  forbidden,
  newCorrelationId,
  publisherIdentity,
  signInRequired,
} from '../lib/auth.js';
import { accessFailureResponse } from '../lib/httpErrors.js';
import { PERMISSION, permissionGate } from '../lib/studioAccess.js';
import { usersStoreFromEnv } from '../lib/users.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

async function requireAccess(request, correlationId, permission) {
  const gate = await permissionGate(request, permission);
  if (!gate.signedIn) {
    return { error: signInRequired(correlationId) };
  }
  if (!gate.allowed) {
    const identity = publisherIdentity(gate.principal);
    trackEvent('StudioAccessDenied', {
      ...identity,
      correlationId,
      route: 'studioUsers',
      permission,
    });
    await flush();
    return {
      error: forbidden(
        correlationId,
        permission === PERMISSION.USERS_MANAGE
          ? 'This account is signed in but cannot change Studio access.'
          : 'This account is signed in but cannot view Studio access.',
      ),
    };
  }
  return { access: gate.access };
}

async function fail(err, { context, correlationId, operation, profileId }) {
  const failure = accessFailureResponse(err, correlationId);
  context.warn('Studio access admin failed', {
    correlationId,
    operation,
    errorKind: failure.errorKind,
    ...(profileId ? { profileId } : {}),
  });
  if (failure.status >= 500) {
    trackException(err, {
      correlationId,
      operation,
      errorKind: failure.errorKind,
      ...(profileId ? { profileId } : {}),
    });
  }
  trackEvent('StudioAccessAdminFailed', {
    correlationId,
    operation,
    errorKind: failure.errorKind,
    ...(profileId ? { profileId } : {}),
  });
  await flush();
  return {
    status: failure.status,
    headers: jsonHeaders(),
    jsonBody: failure.jsonBody,
  };
}

app.http('studioUsers', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'studioUsers',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const permission =
      request.method === 'POST' ? PERMISSION.USERS_MANAGE : PERMISSION.USERS_READ;
    const authed = await requireAccess(request, correlationId, permission);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };

    const operation = request.method === 'POST' ? 'create' : 'list';
    try {
      const store = usersStoreFromEnv();
      if (request.method === 'GET') {
        const users = await store.list();
        trackEvent('StudioAccessAdminOp', { correlationId, operation: 'list' });
        await flush();
        return {
          status: 200,
          headers: jsonHeaders(),
          jsonBody: { users, correlationId },
        };
      }

      const body = await request.json();
      const user = await store.create(body || {});
      trackEvent('StudioAccessAdminOp', {
        correlationId,
        operation: 'create',
        profileId: user.id,
      });
      await flush();
      return {
        status: 201,
        headers: jsonHeaders(),
        jsonBody: { user, correlationId },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation });
    }
  },
});

app.http('studioUserById', {
  methods: ['GET', 'PATCH'],
  authLevel: 'anonymous',
  route: 'studioUsers/{id}',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const profileId = request.params?.id;
    const permission =
      request.method === 'PATCH' ? PERMISSION.USERS_MANAGE : PERMISSION.USERS_READ;
    const authed = await requireAccess(request, correlationId, permission);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };

    const operation = request.method === 'PATCH' ? 'update' : 'get';
    try {
      const store = usersStoreFromEnv();
      if (request.method === 'GET') {
        const user = await store.get(profileId);
        trackEvent('StudioAccessAdminOp', { correlationId, operation: 'get', profileId });
        await flush();
        return {
          status: 200,
          headers: jsonHeaders(),
          jsonBody: { user, correlationId },
        };
      }

      const body = await request.json();
      const etag = request.headers.get('if-match') || body?.etag || '';
      const user = await store.update(profileId, body || {}, { etag });
      trackEvent('StudioAccessAdminOp', { correlationId, operation: 'update', profileId });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: { user, correlationId },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation, profileId });
    }
  },
});
