import { app } from '@azure/functions';
import { forbidden, newCorrelationId, publisherIdentity, signInRequired } from '../lib/auth.js';
import { tryCalendarSettingsStoreFromEnv } from '../lib/calendarSettings.js';
import { requireLessonScheduling } from '../lib/calendarGate.js';
import { contactsStoreFromEnv } from '../lib/contacts.js';
import { calendarFailureResponse } from '../lib/httpErrors.js';
import { lessonsStoreFromEnv } from '../lib/lessons.js';
import { applyLessonStatus, createLessonsWithCalendar, syncLessonRsvps } from '../lib/lessonWorkflow.js';
import { PERMISSION, permissionGate } from '../lib/studioAccess.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

function calendarLog(context, message, { correlationId, operation, lessonId, errorKind }) {
  context.warn(message, {
    correlationId,
    operation,
    errorKind,
    ...(lessonId ? { lessonId } : {}),
  });
}

async function requireCalendar(request, correlationId, permission) {
  const gate = await permissionGate(request, permission);
  if (!gate.signedIn) {
    return { error: signInRequired(correlationId) };
  }
  if (!gate.allowed) {
    const identity = publisherIdentity(gate.principal);
    trackEvent('StudioAccessDenied', {
      ...identity,
      correlationId,
      route: 'lessons',
      permission,
    });
    await flush();
    const error =
      permission === PERMISSION.CALENDAR_WRITE
        ? 'This account is signed in but cannot edit the schedule.'
        : 'This account is signed in but cannot view the schedule.';
    return { error: forbidden(correlationId, error) };
  }
  return { access: gate.access };
}

async function fail(err, { context, correlationId, operation, lessonId }) {
  const failure = calendarFailureResponse(err, correlationId);
  calendarLog(context, 'Studio lessons failed', {
    correlationId,
    operation,
    lessonId,
    errorKind: failure.errorKind,
  });
  if (failure.status >= 500) {
    trackException(err, {
      correlationId,
      operation,
      errorKind: failure.errorKind,
      ...(lessonId ? { lessonId } : {}),
    });
  }
  trackEvent('StudioLessonsFailed', {
    correlationId,
    operation,
    errorKind: failure.errorKind,
    ...(lessonId ? { lessonId } : {}),
  });
  await flush();
  return {
    status: failure.status,
    headers: jsonHeaders(),
    jsonBody: failure.jsonBody,
  };
}

function readLessons() {
  return lessonsStoreFromEnv();
}

function readContacts() {
  return contactsStoreFromEnv();
}

app.http('lessons', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'lessons',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const scheduling = requireLessonScheduling(correlationId);
    if (scheduling.error) return { ...scheduling.error, headers: jsonHeaders() };
    const permission = request.method === 'POST' ? PERMISSION.CALENDAR_WRITE : PERMISSION.CALENDAR_READ;
    const authed = await requireCalendar(request, correlationId, permission);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };

    const operation = request.method === 'POST' ? 'create' : 'list';
    try {
      const lessons = readLessons();
      const settings = tryCalendarSettingsStoreFromEnv();
      if (request.method === 'GET') {
        if (settings) {
          try {
            await syncLessonRsvps({ lessons, settings });
          } catch {
            // RSVP sync is best-effort; listing still succeeds.
          }
        }
        const url = new URL(request.url);
        const listed = await lessons.list({
          from: url.searchParams.get('from') || '',
          to: url.searchParams.get('to') || '',
          contactId: url.searchParams.get('contactId') || '',
          status: url.searchParams.get('status') || '',
          includeCancelled: url.searchParams.get('includeCancelled') !== '0',
        });
        trackEvent('StudioLessonsOp', { correlationId, operation: 'list' });
        await flush();
        return {
          status: 200,
          headers: jsonHeaders(),
          jsonBody: { ...listed, correlationId },
        };
      }

      const body = await request.json();
      const result = await createLessonsWithCalendar({
        body: body || {},
        lessons,
        contacts: readContacts(),
        settings,
        correlationId,
      });
      trackEvent('StudioLessonsOp', {
        correlationId,
        operation: 'create',
        count: result.lessons.length,
        fallback: result.calendar.fallback || 'google',
      });
      await flush();
      return {
        status: 201,
        headers: jsonHeaders(),
        jsonBody: {
          lessons: result.lessons,
          lesson: result.lessons[0],
          calendar: result.calendar,
          correlationId,
        },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation });
    }
  },
});

app.http('lessonById', {
  methods: ['GET', 'PATCH'],
  authLevel: 'anonymous',
  route: 'lessons/{id}',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const scheduling = requireLessonScheduling(correlationId);
    if (scheduling.error) return { ...scheduling.error, headers: jsonHeaders() };
    const lessonId = request.params?.id;
    const permission = request.method === 'PATCH' ? PERMISSION.CALENDAR_WRITE : PERMISSION.CALENDAR_READ;
    const authed = await requireCalendar(request, correlationId, permission);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };

    const operation = request.method === 'PATCH' ? 'update' : 'get';
    try {
      const lessons = readLessons();
      const lesson = await lessons.get(lessonId);
      if (request.method === 'GET') {
        trackEvent('StudioLessonsOp', { correlationId, operation: 'get', lessonId });
        await flush();
        return {
          status: 200,
          headers: jsonHeaders(),
          jsonBody: { lesson, correlationId },
        };
      }

      const body = await request.json();
      const status = String(body?.status || '').trim().toLowerCase();
      let updated = lesson;
      if (status && status !== lesson.status) {
        updated = await applyLessonStatus({
          lesson,
          status,
          lessons,
          settings: tryCalendarSettingsStoreFromEnv(),
        });
      } else if (body?.startAt) {
        updated = await lessons.update(lessonId, body, { etag: request.headers.get('if-match') || body?.etag });
      }
      trackEvent('StudioLessonsOp', { correlationId, operation: 'update', lessonId });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: { lesson: updated, correlationId },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation, lessonId });
    }
  },
});
