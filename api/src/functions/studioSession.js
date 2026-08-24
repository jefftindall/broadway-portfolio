import { app } from '@azure/functions';
import { getClientPrincipal, newCorrelationId } from '../lib/auth.js';
import { lessonSchedulingEnabledFromEnv } from '../lib/lessonPayConfig.js';
import { resolveStudioAccess, sessionPayload } from '../lib/studioAccess.js';
import { studioPublishMode } from '../lib/studioPublish.js';

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

/**
 * Signed-in session: roles, discrete permissions, and the permission catalog.
 * UI gating only — every privileged route still re-checks on the API.
 */
app.http('studioSession', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'studioSession',
  handler: async (request) => {
    const publishMode = studioPublishMode();
    const access = await resolveStudioAccess(getClientPrincipal(request));
    return {
      status: 200,
      headers: jsonHeaders(),
      jsonBody: sessionPayload(access, {
        publishMode,
        correlationId: newCorrelationId(),
        lessonSchedulingEnabled: lessonSchedulingEnabledFromEnv(),
      }),
    };
  },
});
