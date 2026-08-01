import { app } from '@azure/functions';
import { getClientPrincipal, isAuthorizedPublisher, publisherIdentity } from '../lib/auth.js';

app.http('publisherStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'publisherStatus',
  handler: async (request) => {
    if (process.env.AZURE_FUNCTIONS_ENVIRONMENT === 'Development') {
      return {
        status: 200,
        jsonBody: { authorized: true, reason: 'development' },
      };
    }

    const principal = getClientPrincipal(request);
    const identity = publisherIdentity(principal);
    const authorized = isAuthorizedPublisher(principal);

    return {
      status: 200,
      jsonBody: {
        authorized,
        userId: identity.userId || undefined,
        userDetails: identity.userDetails || undefined,
      },
    };
  },
});
