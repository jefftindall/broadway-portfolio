import { app } from '@azure/functions';
import { tryCalendarSettingsStoreFromEnv } from '../lib/calendarSettings.js';
import { newCorrelationId } from '../lib/auth.js';
import { tryLessonsStoreFromEnv } from '../lib/lessons.js';
import { syncLessonRsvps } from '../lib/lessonWorkflow.js';
import { flush, trackEvent } from '../lib/telemetry.js';

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

/**
 * Google Calendar push notification. Anonymous + channel token check.
 * Never log tokens or attendee emails.
 */
app.http('calendarWatch', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'calendarWatch',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const channelToken = request.headers.get('x-goog-channel-token') || '';
    const resourceState = request.headers.get('x-goog-resource-state') || '';
    try {
      const settings = tryCalendarSettingsStoreFromEnv();
      const lessons = tryLessonsStoreFromEnv();
      if (!settings || !lessons) {
        return { status: 204, headers: jsonHeaders() };
      }
      const watch = await settings.getWatch();
      if (watch.token && channelToken && watch.token !== channelToken) {
        trackEvent('StudioCalendarWatchDenied', { correlationId });
        await flush();
        return { status: 401, headers: jsonHeaders() };
      }
      if (resourceState !== 'sync') {
        await syncLessonRsvps({ lessons, settings });
      }
      trackEvent('StudioCalendarWatch', { correlationId, resourceState });
      await flush();
      return { status: 204, headers: jsonHeaders() };
    } catch (err) {
      context.warn('Studio Calendar watch failed', {
        correlationId,
        errorKind: err?.kind || err?.name || 'unknown',
      });
      await flush();
      return { status: 204, headers: jsonHeaders() };
    }
  },
});
