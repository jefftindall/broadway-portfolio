import { app } from '@azure/functions';
import {
  getClientPrincipal,
  isAuthorizedPublisher,
  publisherIdentity,
  unauthorized,
} from '../lib/auth.js';
import { commitFile } from '../lib/github.js';
import { flush, trackEvent } from '../lib/telemetry.js';
import slugify from 'slugify';

app.http('uploadMedia', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'uploadMedia',
  handler: async (request, context) => {
    const principal = getClientPrincipal(request);
    if (process.env.AZURE_FUNCTIONS_ENVIRONMENT !== 'Development') {
      if (!isAuthorizedPublisher(principal)) {
        const identity = publisherIdentity(principal);
        context.warn('Rejected upload attempt', { userId: identity.userId });
        trackEvent('StudioPublishDenied', {
          ...identity,
          route: 'uploadMedia',
        });
        await flush();
        return unauthorized();
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
    }

    if (!body?.dataBase64 || !body?.name) {
      return { status: 400, jsonBody: { error: 'name and dataBase64 are required' } };
    }

    try {
      const safe = slugify(String(body.name).replace(/\.\w+$/, ''), {
        lower: true,
        strict: true,
      });
      const filename = `${Date.now()}-${safe || 'photo'}.jpg`;
      const repoPath = `public/images/photos/${filename}`;
      await commitFile({
        path: repoPath,
        content: body.dataBase64,
        message: `media: upload ${filename}`,
        binary: true,
      });
      return {
        status: 200,
        jsonBody: { path: `/images/photos/${filename}`, repoPath },
      };
    } catch (err) {
      context.error(err);
      return { status: 500, jsonBody: { error: err.message || 'Upload failed' } };
    }
  },
});
