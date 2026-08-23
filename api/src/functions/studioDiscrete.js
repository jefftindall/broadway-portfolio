import { app } from '@azure/functions';
import {
  newCorrelationId,
  publisherGate,
  publisherIdentity,
} from '../lib/auth.js';
import { readLiveLessonRates } from '../lib/gemini.js';
import { readSiteSettings } from '../lib/siteSettings.js';
import { studioFailureResponse } from '../lib/httpErrors.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

/**
 * Current discrete values for Studio Quick edit (rates) and form prefills.
 */
app.http('studioDiscrete', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'studioDiscrete',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();

    const gate = publisherGate(request);
    if (!gate.allowed) {
      const identity = publisherIdentity(gate.principal);
      trackEvent('StudioAccessDenied', {
        ...identity,
        correlationId,
        route: 'studioDiscrete',
      });
      await flush();
      return {
        status: 200,
        jsonBody: { authorized: false, correlationId },
      };
    }

    try {
      const [rates, settings] = await Promise.all([
        readLiveLessonRates(),
        readSiteSettings().catch(() => null),
      ]);

      return {
        status: 200,
        jsonBody: {
          authorized: true,
          rates: rates || [],
          reelUrl: settings?.reelUrl || null,
          reelTitle: settings?.reelTitle || null,
          shortBio: settings?.shortBio || null,
          pressQuote: settings?.pressQuote || null,
          performer: settings?.performer || null,
          correlationId,
        },
      };
    } catch (err) {
      const failure = studioFailureResponse(err, correlationId, {
        operation: 'studioDiscrete',
      });
      context.error('Studio discrete read failed', {
        correlationId,
        errorKind: failure.errorKind,
        message: err instanceof Error ? err.message : String(err),
      });
      trackException(err, {
        operation: 'studioDiscrete',
        correlationId,
        errorKind: failure.errorKind,
      });
      await flush();
      return { status: failure.status, jsonBody: failure.jsonBody };
    }
  },
});
