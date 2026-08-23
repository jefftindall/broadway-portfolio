import { app } from '@azure/functions';
import {
  isDevelopmentEnvironment,
  publisherGate,
  publisherIdentity,
} from '../lib/auth.js';
import { studioPublishMode } from '../lib/studioPublish.js';
import { flush, trackEvent } from '../lib/telemetry.js';

app.http('publisherStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'publisherStatus',
  handler: async (request, context) => {
    const publishMode = studioPublishMode();
    if (isDevelopmentEnvironment()) {
      return {
        status: 200,
        jsonBody: { authorized: true, reason: 'development', publishMode },
      };
    }

    const gate = publisherGate(request);
    const identity = publisherIdentity(gate.principal);
    const authorized = gate.allowed;

    if (!authorized) {
      const correlationId = gate.correlationId;
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
        publishMode,
      },
    };
  },
});
