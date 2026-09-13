import { app } from '@azure/functions';
import { providerKindForLog } from '../lib/authRoles.js';
import { tryCalendarSettingsStoreFromEnv } from '../lib/calendarSettings.js';
import {
  assertContactBookRateLimit,
  loadContactSchedule,
  requireContactBooking,
} from '../lib/contactLessonBook.js';
import { contactsStoreFromEnv } from '../lib/contacts.js';
import { calendarFailureResponse } from '../lib/httpErrors.js';
import { createLessonsWithCalendar } from '../lib/lessonWorkflow.js';
import { lessonsStoreFromEnv } from '../lib/lessons.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

function bookLog(context, message, { correlationId, operation, contactId, errorKind }) {
  context.warn(message, {
    correlationId,
    operation,
    errorKind,
    ...(contactId ? { contactId } : {}),
  });
}

async function fail(err, { context, correlationId, operation, contactId }) {
  const failure = calendarFailureResponse(err, correlationId);
  bookLog(context, 'Contact lesson book failed', {
    correlationId,
    operation,
    contactId,
    errorKind: failure.errorKind,
  });
  if (failure.status >= 500) {
    trackException(err, {
      correlationId,
      operation,
      errorKind: failure.errorKind,
      ...(contactId ? { contactId } : {}),
    });
  }
  trackEvent('ContactLessonBookFailed', {
    correlationId,
    operation,
    errorKind: failure.errorKind,
    ...(contactId ? { contactId } : {}),
  });
  await flush();
  return {
    status: failure.status,
    headers: jsonHeaders(),
    jsonBody: failure.jsonBody,
  };
}

app.http('lessonSchedule', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'lessonSchedule',
  handler: async (request, context) => {
    const authed = await requireContactBooking(request, 'schedule');
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };
    const { contactId, correlationId } = authed;

    try {
      const url = new URL(request.url);
      const durationMin = Number(url.searchParams.get('durationMin') || 60);
      const schedule = await loadContactSchedule({
        durationMin,
      });
      trackEvent('ContactLessonBookOp', {
        correlationId,
        operation: 'schedule',
        contactId,
        connected: schedule.connected,
        slotCount: schedule.slots.length,
      });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: {
          connected: schedule.connected,
          slots: schedule.slots,
          timezone: schedule.availability?.timezone || 'America/New_York',
          correlationId,
        },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation: 'schedule', contactId });
    }
  },
});

app.http('lessonBook', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'lessonBook',
  handler: async (request, context) => {
    const authed = await requireContactBooking(request, 'book');
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };
    const { contact, contactId, correlationId, contactsStore } = authed;

    try {
      const body = await request.json();
      const lessons = lessonsStoreFromEnv();
      await assertContactBookRateLimit({ lessons, contactId });

      const settings = tryCalendarSettingsStoreFromEnv();
      const result = await createLessonsWithCalendar({
        body: {
          startAt: body?.startAt,
          durationMin: body?.durationMin,
          format: body?.format || contact.studentFormat || 'zoom',
          timezone: body?.timezone || contact.timezone,
          contactId,
          recurring: false,
        },
        lessons,
        contacts: contactsStore || contactsStoreFromEnv(),
        settings,
        correlationId,
      });

      trackEvent('ContactLessonBookOp', {
        correlationId,
        operation: 'book',
        contactId,
        lessonId: result.lessons[0]?.id,
        providerKind: providerKindForLog(authed.gate.principal),
      });
      await flush();
      return {
        status: 201,
        headers: jsonHeaders(),
        jsonBody: {
          lesson: result.lessons[0],
          status: 'requested',
          message:
            'Your lesson is requested. Elyse will confirm the time after she accepts the calendar invite.',
          correlationId,
        },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation: 'book', contactId });
    }
  },
});
