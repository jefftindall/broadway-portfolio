import { app } from '@azure/functions';
import { getClientPrincipal, newCorrelationId } from '../lib/auth.js';
import { resolveStudioAccess, sessionPayload } from '../lib/studioAccess.js';
import { studioPublishMode } from '../lib/studioPublish.js';

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

async function sessionResponse(request) {
  const publishMode = studioPublishMode();
  const access = await resolveStudioAccess(getClientPrincipal(request));
  return {
    status: 200,
    headers: jsonHeaders(),
    jsonBody: sessionPayload(access, {
      publishMode,
      correlationId: newCorrelationId(),
    }),
  };
}

/**
 * Same payload as studioSession. Kept so existing hub callers share the
 * permission catalog — `authorized` means `content.publish`, not "can use Studio".
 */
app.http('publisherStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'publisherStatus',
  handler: async (request) => sessionResponse(request),
});
