import { app } from '@azure/functions';
import {
  getClientPrincipal,
  isAuthorizedPublisher,
  newCorrelationId,
  publisherIdentity,
  unauthorized,
} from '../lib/auth.js';
import { commitFile, ensurePullRequest, preparePublishTarget } from '../lib/github.js';
import { studioFailureResponse } from '../lib/httpErrors.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';
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
        const correlationId = newCorrelationId();
        context.warn('Rejected upload attempt', {
          correlationId,
          userId: identity.userId,
          userDetails: identity.userDetails,
          identityProvider: identity.identityProvider,
        });
        trackEvent('StudioPublishDenied', {
          ...identity,
          correlationId,
          route: 'uploadMedia',
        });
        await flush();
        return unauthorized(correlationId);
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

    const correlationId = newCorrelationId();

    try {
      const target = await preparePublishTarget();
      const safe = slugify(String(body.name).replace(/\.\w+$/, ''), {
        lower: true,
        strict: true,
      });
      const filename = `${Date.now()}-${safe || 'photo'}.jpg`;
      const repoPath = `public/images/photos/${filename}`;
      const committed = await commitFile({
        path: repoPath,
        content: body.dataBase64,
        message: `media: upload ${filename}`,
        binary: true,
        branch: target.branch,
      });
      /** @type {{ number: number, url: string } | null} */
      let pullRequest = null;
      if (target.mode === 'pr') {
        const pr = await ensurePullRequest({
          head: target.branch,
          base: target.base,
        });
        pullRequest = { number: pr.number, url: pr.url };
      }
      return {
        status: 200,
        jsonBody: {
          path: `/images/photos/${filename}`,
          repoPath,
          commitSha: committed.commitSha || undefined,
          publishMode: target.mode,
          branch: target.branch,
          ...(pullRequest
            ? { prUrl: pullRequest.url, prNumber: pullRequest.number }
            : {}),
        },
      };
    } catch (err) {
      const failure = studioFailureResponse(err, correlationId, {
        operation: 'uploadMedia',
      });
      context.error('Studio upload failed', {
        correlationId,
        errorKind: failure.errorKind,
        message: err instanceof Error ? err.message : String(err),
      });
      trackException(err, {
        operation: 'uploadMedia',
        correlationId,
        errorKind: failure.errorKind,
      });
      trackEvent('StudioPublishFailed', {
        correlationId,
        operation: 'uploadMedia',
        errorKind: failure.errorKind,
        userId: principal?.userId || 'local',
      });
      await flush();
      return { status: failure.status, jsonBody: failure.jsonBody };
    }
  },
});
