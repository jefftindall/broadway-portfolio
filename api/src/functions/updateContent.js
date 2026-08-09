import { app } from '@azure/functions';
import {
  getClientPrincipal,
  isAuthorizedPublisher,
  newCorrelationId,
  publisherIdentity,
  unauthorized,
} from '../lib/auth.js';
import { commitFile } from '../lib/github.js';
import { applyContentChanges, buildContentChange, runContentAgent } from '../lib/gemini.js';
import { studioFailureResponse } from '../lib/httpErrors.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';
import slugify from 'slugify';

function provisionalPhotoPath(photoName) {
  const safe = slugify(String(photoName || 'photo').replace(/\.\w+$/, ''), {
    lower: true,
    strict: true,
  });
  return `/images/photos/pending-${safe || 'photo'}.jpg`;
}

function realPhotoFilename(photoName) {
  const safe = slugify(String(photoName || 'photo').replace(/\.\w+$/, ''), {
    lower: true,
    strict: true,
  });
  return `${Date.now()}-${safe || 'photo'}.jpg`;
}

/**
 * Replace provisional photo paths in change content with the committed public path.
 */
function rewritePhotoPaths(changes, fromPath, toPath) {
  if (!fromPath || !toPath || fromPath === toPath) return changes;
  return changes.map((change) => ({
    ...change,
    content: String(change.content || '').split(fromPath).join(toPath),
  }));
}

app.http('updateContent', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'updateContent',
  handler: async (request, context) => {
    const principal = getClientPrincipal(request);
    // In production SWA, routes already require auth; still enforce allowlist.
    if (process.env.AZURE_FUNCTIONS_ENVIRONMENT !== 'Development') {
      if (!isAuthorizedPublisher(principal)) {
        const identity = publisherIdentity(principal);
        const correlationId = newCorrelationId();
        context.warn('Rejected publish attempt', {
          correlationId,
          userId: identity.userId,
          userDetails: identity.userDetails,
          identityProvider: identity.identityProvider,
        });
        trackEvent('StudioPublishDenied', {
          ...identity,
          correlationId,
          route: 'updateContent',
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

    const modeRaw = String(body.mode || 'publish').toLowerCase();
    const mode =
      modeRaw === 'draft' ? 'draft' : modeRaw === 'compose' ? 'compose' : 'publish';
    const correlationId = newCorrelationId();
    const hasPhoto = Boolean(body.photo?.dataBase64);
    const operation =
      mode === 'draft' ? 'draftContent' : mode === 'compose' ? 'composeContent' : 'updateContent';

    try {
      if (mode === 'compose') {
        const tool = String(body.tool || '').trim();
        const args = body.args && typeof body.args === 'object' ? body.args : {};
        if (!tool) {
          return { status: 400, jsonBody: { error: 'tool is required for compose' } };
        }
        trackEvent('StudioComposeRequested', {
          userId: principal?.userId || 'local',
          tool,
          correlationId,
        });
        const change = await buildContentChange(tool, args, undefined);
        return {
          status: 200,
          jsonBody: {
            reply: change.summary,
            changes: [change],
            correlationId,
          },
        };
      }

      if (mode === 'draft') {
        const message = String(body.message || '').trim();
        if (!message) {
          return { status: 400, jsonBody: { error: 'message is required' } };
        }

        trackEvent('StudioDraftRequested', {
          userId: principal?.userId || 'local',
          hasPhoto,
          correlationId,
        });

        const photoPath = hasPhoto ? provisionalPhotoPath(body.photo?.name) : undefined;
        const result = await runContentAgent({ message, photoPath });
        return {
          status: 200,
          jsonBody: {
            reply: result.reply,
            changes: result.changes,
            provisionalPhotoPath: photoPath || null,
            correlationId,
          },
        };
      }

      // publish: commit approved changes (optionally with photo)
      const rawChanges = Array.isArray(body.changes) ? body.changes : null;
      if (!rawChanges || rawChanges.length === 0) {
        return { status: 400, jsonBody: { error: 'changes is required for publish' } };
      }

      trackEvent('StudioPublishRequested', {
        userId: principal?.userId || 'local',
        hasPhoto,
        correlationId,
        changeCount: String(rawChanges.length),
      });

      let changes = rawChanges.map((c) => ({
        path: String(c.path || ''),
        content: String(c.content ?? ''),
        commitMessage: String(c.commitMessage || c.message || ''),
        tool: c.tool ? String(c.tool) : undefined,
        summary: c.summary ? String(c.summary) : undefined,
      }));

      let photoPath;
      let lastCommitSha = '';
      if (hasPhoto && body.photo?.name) {
        const filename = realPhotoFilename(body.photo.name);
        const repoPath = `public/images/photos/${filename}`;
        const photoCommit = await commitFile({
          path: repoPath,
          content: body.photo.dataBase64,
          message: `media: upload ${filename}`,
          binary: true,
        });
        if (photoCommit.commitSha) lastCommitSha = photoCommit.commitSha;
        photoPath = `/images/photos/${filename}`;
        const provisional = body.provisionalPhotoPath
          ? String(body.provisionalPhotoPath)
          : provisionalPhotoPath(body.photo.name);
        changes = rewritePhotoPaths(changes, provisional, photoPath);
      }

      const result = await applyContentChanges(changes);
      const commitSha = result.commitSha || lastCommitSha || undefined;
      return {
        status: 200,
        jsonBody: {
          reply: result.reply,
          actions: result.actions,
          commitSha,
          correlationId,
        },
      };
    } catch (err) {
      const failure = studioFailureResponse(err, correlationId, {
        operation,
      });
      context.error(
        mode === 'draft' ? 'Studio draft failed' : mode === 'compose' ? 'Studio compose failed' : 'Studio publish failed',
        {
        correlationId,
        errorKind: failure.errorKind,
        message: err instanceof Error ? err.message : String(err),
      });
      trackException(err, {
        operation,
        correlationId,
        errorKind: failure.errorKind,
      });
      trackEvent(
        mode === 'draft'
          ? 'StudioDraftFailed'
          : mode === 'compose'
            ? 'StudioComposeFailed'
            : 'StudioPublishFailed',
        {
        correlationId,
        operation,
        errorKind: failure.errorKind,
        userId: principal?.userId || 'local',
      });
      await flush();
      return { status: failure.status, jsonBody: failure.jsonBody };
    }
  },
});
