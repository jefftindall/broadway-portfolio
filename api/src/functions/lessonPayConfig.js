import { app } from '@azure/functions';
import { publicLessonPayConfigFromEnv } from '../lib/lessonPayConfig.js';

app.http('lessonPayConfig', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'lessonPayConfig',
  handler: async () => {
    const body = publicLessonPayConfigFromEnv();
    return {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
      },
      jsonBody: body,
    };
  },
});
