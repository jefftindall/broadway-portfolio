import { app } from '@azure/functions';
import { getClientPrincipal, isAuthorizedPublisher, unauthorized } from '../lib/auth.js';
import { commitFile } from '../lib/github.js';
import { runContentAgent } from '../lib/gemini.js';
import slugify from 'slugify';

app.http('updateContent', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'updateContent',
  handler: async (request, context) => {
    const principal = getClientPrincipal(request);
    // In production SWA, routes already require auth; still enforce allowlist.
    if (process.env.AZURE_FUNCTIONS_ENVIRONMENT !== 'Development') {
      if (!isAuthorizedPublisher(principal)) {
        context.warn('Rejected publish attempt', { userId: principal?.userId });
        return unauthorized();
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
    }

    const message = String(body.message || '').trim();
    if (!message) {
      return { status: 400, jsonBody: { error: 'message is required' } };
    }

    let photoPath;
    try {
      if (body.photo?.dataBase64 && body.photo?.name) {
        const safe = slugify(body.photo.name.replace(/\.\w+$/, ''), {
          lower: true,
          strict: true,
        });
        const filename = `${Date.now()}-${safe || 'photo'}.jpg`;
        const repoPath = `public/images/photos/${filename}`;
        await commitFile({
          path: repoPath,
          content: body.photo.dataBase64,
          message: `media: upload ${filename}`,
          binary: true,
        });
        photoPath = `/images/photos/${filename}`;
      }

      const result = await runContentAgent({ message, photoPath });
      return { status: 200, jsonBody: result };
    } catch (err) {
      context.error(err);
      return {
        status: 500,
        jsonBody: { error: err.message || 'Failed to publish update' },
      };
    }
  },
});
