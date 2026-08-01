import { app } from '@azure/functions';
import {
  getClientPrincipal,
  isAuthorizedPublisher,
  newCorrelationId,
  publisherIdentity,
} from '../lib/auth.js';
import { flush, trackEvent } from '../lib/telemetry.js';

app.http('publisherStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'publisherStatus',
  handler: async (request, context) => {
    if (process.env.AZURE_FUNCTIONS_ENVIRONMENT === 'Development') {
      return {
        status: 200,
        jsonBody: { authorized: true, reason: 'development' },
      };
    }

    const principal = getClientPrincipal(request);
    const identity = publisherIdentity(principal);
    const authorized = isAuthorizedPublisher(principal);

    if (!authorized) {
      const correlationId = newCorrelationId();
      context.warn('Studio access denied', {
        correlationId,
        userId: identity.userId,
        userDetails: identity.userDetails,
        identityProvider: identity.identityProvider,
      });
      trackEvent('StudioAccessDenied', {
        ...identity,
        correlationId,
        route: 'publisherStatus',
      });
      await flush();
      return {
        status: 200,
        jsonBody: {
          authorized: false,
          correlationId,
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        authorized: true,
        userId: identity.userId || undefined,
        userDetails: identity.userDetails || undefined,
      },
    };
  },
});
