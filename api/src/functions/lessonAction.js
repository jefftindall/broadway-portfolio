import { app } from '@azure/functions';
import { newCorrelationId } from '../lib/auth.js';
import { tryCalendarSettingsStoreFromEnv } from '../lib/calendarSettings.js';
import { requireLessonScheduling } from '../lib/calendarGate.js';
import { calendarFailureResponse } from '../lib/httpErrors.js';
import { readLessonActionToken } from '../lib/lessonActions.js';
import { applyLessonStatus } from '../lib/lessonWorkflow.js';
import { lessonsStoreFromEnv } from '../lib/lessons.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.25rem">${title}</h1>
<p>${body}</p>
</body>
</html>`;
}

app.http('lessonAction', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'lessonAction',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const scheduling = requireLessonScheduling(correlationId);
    if (scheduling.error) {
      return {
        status: scheduling.error.status,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: htmlPage('Scheduling unavailable', scheduling.error.jsonBody?.error || 'Lesson scheduling is not enabled.'),
      };
    }
    const url = new URL(request.url);
    const token = url.searchParams.get('t') || '';
    try {
      const payload = readLessonActionToken(token);
      const lessons = lessonsStoreFromEnv();
      const lesson = await lessons.get(payload.lessonId);
      const status = payload.action === 'confirm' ? 'confirmed' : 'declined';
      await applyLessonStatus({
        lesson,
        status,
        lessons,
        settings: tryCalendarSettingsStoreFromEnv(),
      });
      trackEvent('StudioLessonAction', { correlationId, action: payload.action, lessonId: lesson.id });
      await flush();
      const title = status === 'confirmed' ? 'Lesson confirmed' : 'Lesson declined';
      const copy =
        status === 'confirmed'
          ? 'This request is now Confirmed. The student will get a confirmation email when that mail ships.'
          : 'This request is now Declined.';
      return {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
        body: htmlPage(title, `${copy} Reference: ${correlationId}`),
      };
    } catch (err) {
      const failure = calendarFailureResponse(err, correlationId);
      if (failure.status >= 500) {
        trackException(err, { correlationId, operation: 'lessonAction', errorKind: failure.errorKind });
      }
      trackEvent('StudioLessonActionFailed', { correlationId, errorKind: failure.errorKind });
      await flush();
      context.warn('Studio lesson action failed', { correlationId, errorKind: failure.errorKind });
      return {
        status: failure.status === 400 ? 400 : failure.status,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
        body: htmlPage('Could not update that lesson', `${failure.jsonBody.error} Reference: ${correlationId}`),
      };
    }
  },
});
