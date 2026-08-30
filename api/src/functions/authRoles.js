import { app } from '@azure/functions';
import { newCorrelationId } from '../lib/auth.js';
import { assignSwRoles, providerKindForLog } from '../lib/authRoles.js';

app.http('authRoles', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'authRoles',
  handler: async (request) => {
    const correlationId = newCorrelationId();
    /** @type {Record<string, unknown>} */
    let principal = {};
    try {
      principal = (await request.json()) ?? {};
    } catch {
      principal = {};
    }

    const roles = assignSwRoles(principal);
    console.log(
      JSON.stringify({
        event: 'AuthRolesAssigned',
        correlationId,
        providerKind: providerKindForLog(principal),
        roleCount: roles.length,
      }),
    );

    return {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
      },
      jsonBody: { roles },
    };
  },
});
