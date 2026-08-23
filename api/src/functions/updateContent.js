import { app } from '@azure/functions';
import crypto from 'node:crypto';
import {
  newCorrelationId,
  publisherIdentity,
  unauthorized,
} from '../lib/auth.js';
import { publisherGate } from '../lib/studioAccess.js';
import { ensurePullRequest, preparePublishTarget } from '../lib/github.js';
import {
  applyContentChanges,
  buildContentChange,
  normalizeContentHash,
  runContentAgent,
} from '../lib/gemini.js';
import { studioFailureResponse } from '../lib/httpErrors.js';
import {
  REEL_POSTER_REPO_PATH,
  fetchReelPoster,
  reelUrlFromPublishChanges,
} from '../lib/reelPoster.js';
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

/**
 * SHA-256 of the raw photo bytes Studio is about to commit (never a derived variant).
 * @param {{ dataBase64?: string } | undefined} photo
 */
function originalContentHashFromPhoto(photo) {
  if (!photo?.dataBase64) return undefined;
  const buf = Buffer.from(String(photo.dataBase64), 'base64');
  if (!buf.length) return undefined;
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Ensure gallery markdown written before publish still carries the raw-file hash.
 * @param {Array<{ path: string, content: string }>} changes
 * @param {string | undefined} hash
 */
function injectGalleryContentHash(changes, hash) {
  const contentHash = normalizeContentHash(hash);
  if (!contentHash) return changes;
  return changes.map((change) => {
    if (!String(change.path || '').replace(/\\/g, '/').startsWith('src/content/gallery/')) {
      return change;
    }
    const content = String(change.content || '');
    if (/^contentHash:/m.test(content)) return change;
    if (!/^image:/m.test(content)) return change;
    return {
      ...change,
      content: content.replace(/^(image:\s*.+)$/m, `$1\ncontentHash: ${JSON.stringify(contentHash)}`),
    };
  });
}

app.http('updateContent', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'updateContent',
  handler: async (request, context) => {
    const gate = await publisherGate(request);
    const principal = gate.principal;
    // SWA `authenticated` is not permission to publish — re-check content.publish.
    if (!gate.allowed) {
      const identity = publisherIdentity(principal);
      const correlationId = gate.correlationId;
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
          hasPhoto,
          correlationId,
        });
        // Optional attached photo → provisional path (same as draft); binary commits on publish.
        const photoPath = hasPhoto ? provisionalPhotoPath(body.photo?.name) : undefined;
        const originalContentHash = originalContentHashFromPhoto(body.photo);
        const change = await buildContentChange(tool, args, photoPath, { originalContentHash });
        return {
          status: 200,
          jsonBody: {
            reply: change.summary,
            changes: [change],
            provisionalPhotoPath: photoPath || null,
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
        const originalContentHash = originalContentHashFromPhoto(body.photo);
        const result = await runContentAgent({ message, photoPath, originalContentHash });
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

      const target = await preparePublishTarget();

      trackEvent('StudioPublishRequested', {
        userId: principal?.userId || 'local',
        hasPhoto,
        correlationId,
        changeCount: String(rawChanges.length),
        publishMode: target.mode,
        branch: target.branch,
      });

      let changes = rawChanges.map((c) => ({
        path: String(c.path || ''),
        content: String(c.content ?? ''),
        commitMessage: String(c.commitMessage || c.message || ''),
        tool: c.tool ? String(c.tool) : undefined,
        summary: c.summary ? String(c.summary) : undefined,
        preview: c.preview && typeof c.preview === 'object' ? c.preview : undefined,
        commitParams:
          c.commitParams && typeof c.commitParams === 'object' ? c.commitParams : undefined,
      }));

      /** @type {Array<{ path: string, content: string, binary: boolean }>} */
      let extraFiles = [];
      if (hasPhoto && body.photo?.name) {
        const filename = realPhotoFilename(body.photo.name);
        const repoPath = `public/images/photos/${filename}`;
        const photoPath = `/images/photos/${filename}`;
        const provisional = body.provisionalPhotoPath
          ? String(body.provisionalPhotoPath)
          : provisionalPhotoPath(body.photo.name);
        // Rewrite markdown to the final public path before the single atomic commit.
        changes = rewritePhotoPaths(changes, provisional, photoPath);
        changes = injectGalleryContentHash(changes, originalContentHashFromPhoto(body.photo));
        extraFiles = [
          {
            path: repoPath,
            content: body.photo.dataBase64,
            binary: true,
          },
        ];
      }

      const reelUrl = reelUrlFromPublishChanges(changes);
      if (reelUrl) {
        try {
          const poster = await fetchReelPoster(reelUrl);
          if (poster) {
            extraFiles = [
              ...extraFiles,
              {
                path: REEL_POSTER_REPO_PATH,
                content: poster.contentBase64,
                binary: true,
              },
            ];
            trackEvent('StudioReelPosterUpdated', { correlationId });
          } else {
            trackEvent('StudioReelPosterSkipped', { correlationId, reason: 'unavailable' });
            context.warn('Reel poster fetch returned no still; publishing reel URL without a new poster', {
              correlationId,
            });
          }
        } catch (err) {
          trackEvent('StudioReelPosterSkipped', {
            correlationId,
            reason: 'error',
            errName: err instanceof Error ? err.name : 'Error',
          });
          context.warn('Reel poster fetch failed; publishing reel URL without a new poster', {
            correlationId,
          });
        }
      }

      const result = await applyContentChanges(changes, {
        branch: target.branch,
        publishMode: target.mode,
        extraFiles,
      });
      const commitSha = result.commitSha || undefined;

      /** @type {{ number: number, url: string, created: boolean } | null} */
      let pullRequest = null;
      if (target.mode === 'pr') {
        pullRequest = await ensurePullRequest({
          head: target.branch,
          base: target.base,
        });
      }

      return {
        status: 200,
        jsonBody: {
          reply: result.reply,
          actions: result.actions,
          commitSha,
          correlationId,
          publishMode: target.mode,
          branch: target.branch,
          ...(pullRequest
            ? {
                prUrl: pullRequest.url,
                prNumber: pullRequest.number,
              }
            : {}),
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
