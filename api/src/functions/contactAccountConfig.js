import { app } from '@azure/functions';
import { publicContactAccountConfigFromEnv } from '../lib/contactAccountConfig.js';

app.http('contactAccountConfig', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'contactAccountConfig',
  handler: async () => {
    const body = publicContactAccountConfigFromEnv();
    return {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
      },
      jsonBody: body,
    };
  },
});
