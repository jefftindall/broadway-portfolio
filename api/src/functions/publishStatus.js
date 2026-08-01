import { app } from '@azure/functions';
import {
  getClientPrincipal,
  isAuthorizedPublisher,
  newCorrelationId,
  publisherIdentity,
  unauthorized,
} from '../lib/auth.js';
import { studioFailureResponse } from '../lib/httpErrors.js';
import { getPublishPipelineStatus } from '../lib/publishStatus.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

app.http('publishStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'publishStatus',
  handler: async (request, context) => {
    const principal = getClientPrincipal(request);
    if (process.env.AZURE_FUNCTIONS_ENVIRONMENT !== 'Development') {
      if (!isAuthorizedPublisher(principal)) {
        const identity = publisherIdentity(principal);
        const correlationId = newCorrelationId();
        context.warn('Rejected publishStatus attempt', {
          correlationId,
          userId: identity.userId,
        });
        trackEvent('StudioPublishDenied', {
          ...identity,
          correlationId,
          route: 'publishStatus',
        });
        await flush();
        return unauthorized(correlationId);
      }
    }

    const sha = String(request.query.get('sha') || '').trim();
    if (!sha) {
      return { status: 400, jsonBody: { error: 'sha is required' } };
    }

    const correlationId = newCorrelationId();
    try {
      const result = await getPublishPipelineStatus(sha);
      return { status: 200, jsonBody: { ...result, correlationId } };
    } catch (err) {
      if (err && err.status === 400) {
        return { status: 400, jsonBody: { error: 'Invalid commit sha' } };
      }
      const failure = studioFailureResponse(err, correlationId, {
        operation: 'publishStatus',
      });
      context.error('Studio publishStatus failed', {
        correlationId,
        errorKind: failure.errorKind,
        message: err instanceof Error ? err.message : String(err),
      });
      trackException(err, {
        operation: 'publishStatus',
        correlationId,
        errorKind: failure.errorKind,
      });
      await flush();
      return { status: failure.status, jsonBody: failure.jsonBody };
    }
  },
});
