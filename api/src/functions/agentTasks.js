import { app } from '@azure/functions';
import { forbidden, newCorrelationId, publisherIdentity, signInRequired } from '../lib/auth.js';
import { listStaleAgentTasks } from '../lib/agentTasks.js';
import { contactsStoreFromEnv } from '../lib/contacts.js';
import { crmFailureResponse } from '../lib/httpErrors.js';
import { PERMISSION, permissionGate } from '../lib/studioAccess.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

app.http('agentTasks', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'agentTasks',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const gate = await permissionGate(request, PERMISSION.PEOPLE_READ);
    if (!gate.signedIn) {
      return { ...signInRequired(correlationId), headers: jsonHeaders() };
    }
    if (!gate.allowed) {
      const identity = publisherIdentity(gate.principal);
      trackEvent('StudioAccessDenied', {
        ...identity,
        correlationId,
        route: 'agentTasks',
        permission: PERMISSION.PEOPLE_READ,
      });
      await flush();
      return {
        ...forbidden(correlationId, 'This account is signed in but cannot view People.'),
        headers: jsonHeaders(),
      };
    }

    try {
      const url = new URL(request.url);
      const staleDays = Number.parseInt(url.searchParams.get('staleDays') || '', 10);
      const result = await listStaleAgentTasks(contactsStoreFromEnv(), {
        staleDays: Number.isFinite(staleDays) && staleDays > 0 ? staleDays : undefined,
      });
      trackEvent('StudioAgentTasksListed', { correlationId, total: result.total });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: { ...result, correlationId },
      };
    } catch (err) {
      const failure = crmFailureResponse(err, correlationId);
      context.warn('Studio agent tasks failed', {
        correlationId,
        errorKind: failure.errorKind,
      });
      if (failure.status >= 500) {
        trackException(err, { correlationId, operation: 'agentTasks', errorKind: failure.errorKind });
      }
      await flush();
      return {
        status: failure.status,
        headers: jsonHeaders(),
        jsonBody: failure.jsonBody,
      };
    }
  },
});
