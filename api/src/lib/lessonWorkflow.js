/**
 * Lesson create / RSVP / degrade orchestration.
 * Persist the Table row before any Google call. Google failure never loses the request.
 */
import { randomUUID } from 'node:crypto';
import { sendLessonIcsEmail } from './acsNotify.js';
import {
  accessTokenForRefresh,
  attendeeResponse,
  buildLessonEvent,
  createGoogleCalendarClient,
  isGoogleDisconnectedError,
} from './googleCalendar.js';
import { calendarWatchUrl } from './calendarOAuth.js';
import {
  DEFAULT_MIN_NOTICE_HOURS,
  DEFAULT_BUFFER_MINUTES,
} from './calendarSettings.js';
import { CrmNotFoundError } from './contacts.js';
import { lessonActionUrl } from './lessonActions.js';
import { tryNotifyLessonStatus } from './studioComms.js';
import {
  LessonValidationError,
  MAX_RECURRING_INSTANCES,
  addWeeksToWall,
  localWallTimeToIso,
  normalizeLessonInput,
  normalizeRecurringCount,
  DEFAULT_LESSON_TIMEZONE,
} from './lessons.js';

export const LESSON_TIMEZONE = DEFAULT_LESSON_TIMEZONE;

function notifyEmail(env = process.env) {
  const value = String(env.CONTACT_NOTIFY_EMAIL || '').trim();
  return value && value !== 'REPLACE_ME' ? value : '';
}

function overlap(aStart, aEnd, bStart, bEnd, bufferMs) {
  return aStart < bEnd + bufferMs && bStart < aEnd + bufferMs;
}

export function slotConflicts({ startAt, endAt, busy, bufferMinutes = DEFAULT_BUFFER_MINUTES }) {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  const bufferMs = Number(bufferMinutes || 0) * 60_000;
  return (busy || []).some((slot) => {
    const bStart = Date.parse(slot.start);
    const bEnd = Date.parse(slot.end);
    if (!Number.isFinite(bStart) || !Number.isFinite(bEnd)) return false;
    return overlap(start, end, bStart, bEnd, bufferMs);
  });
}

export function violatesMinNotice(startAt, minNoticeHours = DEFAULT_MIN_NOTICE_HOURS, now = Date.now()) {
  const start = Date.parse(startAt);
  if (!Number.isFinite(start)) return false;
  return start < now + Number(minNoticeHours || 0) * 3600_000;
}

async function organizerClient(settings, env) {
  const organizer = await settings.getConnection('organizer');
  if (!organizer.connected) return null;
  const accessToken = await accessTokenForRefresh(organizer.refreshToken, env);
  return { client: createGoogleCalendarClient({ accessToken }), organizer };
}

async function elyseClient(settings, env) {
  const elyse = await settings.getConnection('elyse');
  if (!elyse.connected) return null;
  const accessToken = await accessTokenForRefresh(elyse.refreshToken, env);
  return { client: createGoogleCalendarClient({ accessToken }), elyse };
}

async function elyseInviteEmail(settings, env) {
  const elyse = await settings.getConnection('elyse');
  if (elyse.connected && elyse.email) return elyse.email;
  return notifyEmail(env);
}

async function ensureWatch(settings, client, env) {
  const existing = await settings.getWatch();
  const expires = Date.parse(existing.expiration || '');
  if (existing.channelId && Number.isFinite(expires) && expires - Date.now() > 36 * 3600_000) {
    return existing;
  }
  if (existing.channelId && existing.resourceId) {
    await client.stopChannel({ channelId: existing.channelId, resourceId: existing.resourceId });
  }
  const channelId = randomUUID();
  const token = randomUUID();
  const watched = await client.watchEvents({
    calendarId: 'primary',
    channelId,
    token,
    address: calendarWatchUrl(env),
  });
  const expiration = watched.expiration
    ? new Date(Number(watched.expiration)).toISOString()
    : new Date(Date.now() + 6 * 24 * 3600_000).toISOString();
  return settings.saveWatch({
    channelId: watched.id || channelId,
    resourceId: watched.resourceId || '',
    token,
    expiration,
  });
}

async function sendIcsFallback({ lesson, correlationId, env }) {
  const to = notifyEmail(env);
  if (!to) return { sent: false };
  const confirmUrl = lessonActionUrl(lesson.id, 'confirm', env);
  const declineUrl = lessonActionUrl(lesson.id, 'decline', env);
  await sendLessonIcsEmail({
    lesson,
    to,
    confirmUrl,
    declineUrl,
    correlationId,
    env,
  });
  return { sent: true };
}

export async function createLessonsWithCalendar({
  body,
  lessons,
  contacts,
  settings,
  env = process.env,
  correlationId,
}) {
  const recurring = Boolean(body?.recurring);
  const count = recurring ? normalizeRecurringCount(body?.recurringCount) : 1;
  const base = normalizeLessonInput(body, { partial: false });
  const contact = await contacts.get(base.contactId);
  if (!contact || contact.archived) {
    throw new CrmNotFoundError();
  }

  const availability = settings ? await settings.getAvailability() : null;
  if (availability && violatesMinNotice(base.startAt, availability.minNoticeHours)) {
    throw new LessonValidationError(
      `Lessons need at least ${availability.minNoticeHours} hours’ notice.`,
    );
  }

  const wall = String(body.startAt || '').trim();
  const planned = [];
  const seriesId = count > 1 ? randomUUID() : '';
  for (let i = 0; i < count; i += 1) {
    const startAt =
      i === 0 || !/^\d{4}-\d{2}-\d{2}T/.test(wall)
        ? base.startAt
        : localWallTimeToIso(addWeeksToWall(wall, i), base.timezone);
    planned.push({
      contactId: base.contactId,
      startAt,
      durationMin: base.durationMin,
      format: base.format,
      timezone: base.timezone,
      seriesId,
      occurrenceIndex: count > 1 ? i : null,
      endAt: null,
    });
  }
  for (const item of planned) {
    item.endAt = new Date(Date.parse(item.startAt) + item.durationMin * 60_000).toISOString();
  }

  if (settings && availability?.calendarIds?.length) {
    try {
      const elyse = await elyseClient(settings, env);
      if (elyse) {
        const { busy } = await elyse.client.freeBusy({
          calendarIds: availability.calendarIds,
          timeMin: planned[0].startAt,
          timeMax: planned[planned.length - 1].endAt,
        });
        const conflicted = planned.some((row) =>
          slotConflicts({
            startAt: row.startAt,
            endAt: row.endAt,
            busy,
            bufferMinutes: availability.bufferMinutes,
          }),
        );
        if (conflicted) {
          throw new LessonValidationError(
            'That time overlaps something already on the selected calendars.',
          );
        }
      }
    } catch (err) {
      if (err instanceof LessonValidationError) throw err;
      // Disconnected / timeout: still persist the request.
    }
  }

  const created = [];
  for (const item of planned) {
    created.push(await lessons.create(item));
  }

  async function notifyCreated() {
    for (const row of created) {
      try {
        await tryNotifyLessonStatus({
          lesson: row,
          previousStatus: '',
          contact,
          correlationId,
          lessons,
          env,
        });
      } catch {
        // Student mail must not block lesson persistence.
      }
    }
  }

  let calendar = { connected: false, fallback: '' };
  if (!settings) {
    try {
      await sendIcsFallback({ lesson: created[0], correlationId, env });
      calendar = { connected: false, fallback: 'ics' };
      for (const row of created) {
        await lessons.update(row.id, { calendarFallback: 'ics' });
        row.calendarFallback = 'ics';
      }
    } catch {
      calendar = { connected: false, fallback: 'none' };
    }
    await notifyCreated();
    return { lessons: created, calendar };
  }

  try {
    const organizer = await organizerClient(settings, env);
    if (!organizer) {
      await sendIcsFallback({ lesson: created[0], correlationId, env });
      for (const row of created) {
        await lessons.update(row.id, { calendarFallback: 'ics' });
        row.calendarFallback = 'ics';
      }
      await notifyCreated();
      return { lessons: created, calendar: { connected: false, fallback: 'ics' } };
    }

    const elyseEmail = await elyseInviteEmail(settings, env);
    const event = buildLessonEvent({
      lesson: created[0],
      elyseEmail,
      studentEmail: contact.email || '',
      recurringCount: count,
      env,
    });
    const inserted = await organizer.client.insertEvent({ event, sendUpdates: 'all' });
    const eventId = inserted.id || '';
    for (const row of created) {
      await lessons.update(row.id, {
        googleEventId: eventId,
        googleCalendarId: 'primary',
        calendarFallback: '',
      });
      row.googleEventId = eventId;
      row.googleCalendarId = 'primary';
    }
    try {
      await ensureWatch(settings, organizer.client, env);
    } catch {
      // Watch is best-effort; listing lessons still syncs RSVP.
    }
    calendar = { connected: true, fallback: '' };
  } catch (err) {
    if (err?.name === 'LessonValidationError' || err?.name === 'CrmNotFoundError') throw err;
    try {
      await sendIcsFallback({ lesson: created[0], correlationId, env });
      for (const row of created) {
        await lessons.update(row.id, { calendarFallback: 'ics' });
        row.calendarFallback = 'ics';
      }
      calendar = { connected: false, fallback: 'ics' };
    } catch {
      calendar = { connected: false, fallback: 'none' };
    }
  }

  await notifyCreated();
  return { lessons: created, calendar };
}

export async function applyLessonStatus({
  lesson,
  status,
  lessons,
  settings,
  contacts,
  correlationId,
  env = process.env,
}) {
  const previousStatus = lesson.status;
  if (lesson.status === status) return lesson;
  const updated = await lessons.update(lesson.id, { status });
  if (contacts) {
    try {
      const contact = await contacts.get(updated.contactId);
      await tryNotifyLessonStatus({
        lesson: updated,
        previousStatus,
        contact,
        correlationId,
        lessons,
        env,
      });
    } catch {
      // Mail failure must not roll back status.
    }
  }
  if (!settings || !lesson.googleEventId) return updated;
  try {
    const organizer = await organizerClient(settings, env);
    if (!organizer) return updated;
    const calendarId = lesson.googleCalendarId || 'primary';
    if (status === 'declined' || status === 'cancelled') {
      if (lesson.seriesId && lesson.googleEventId && lesson.occurrenceIndex !== null) {
        const instances = await organizer.client.listInstances({
          calendarId,
          eventId: lesson.googleEventId,
          timeMin: lesson.startAt,
          timeMax: lesson.endAt,
        });
        const instance = instances[0];
        if (instance?.id) {
          await organizer.client.patchEvent({
            calendarId,
            eventId: instance.id,
            event: { status: 'cancelled' },
            sendUpdates: 'all',
          });
          return lessons.update(updated.id, { googleInstanceId: instance.id });
        }
      }
      await organizer.client.deleteEvent({
        calendarId,
        eventId: lesson.googleEventId,
        sendUpdates: 'all',
      });
      return updated;
    }
    if (status === 'confirmed') {
      const elyseEmail = await elyseInviteEmail(settings, env);
      if (elyseEmail) {
        await organizer.client.patchEvent({
          calendarId,
          eventId: lesson.googleEventId,
          event: {
            attendees: [{ email: elyseEmail, responseStatus: 'accepted' }],
          },
          sendUpdates: 'all',
        });
      }
    }
  } catch (err) {
    if (!isGoogleDisconnectedError(err) && err?.name !== 'GoogleCalendarError') throw err;
  }
  return updated;
}

function rsvpStatus(response) {
  if (response === 'accepted') return 'confirmed';
  if (response === 'declined') return 'declined';
  return '';
}

export async function syncLessonRsvps({ lessons, settings, contacts, correlationId, env = process.env }) {
  if (!settings) return { checked: 0, updated: 0 };
  const organizer = await settings.getConnection('organizer');
  if (!organizer.connected) return { checked: 0, updated: 0 };
  const clientWrap = await organizerClient(settings, env);
  if (!clientWrap) return { checked: 0, updated: 0 };
  const elyseEmail = await elyseInviteEmail(settings, env);
  const listed = await lessons.list({ includeCancelled: false });
  let updated = 0;
  const seenEvents = new Map();
  for (const lesson of listed.lessons) {
    if (!lesson.googleEventId) continue;
    if (lesson.status !== 'requested') continue;
    try {
      let event = seenEvents.get(lesson.googleEventId);
      if (!event) {
        event = await clientWrap.client.getEvent({
          calendarId: lesson.googleCalendarId || 'primary',
          eventId: lesson.googleEventId,
        });
        seenEvents.set(lesson.googleEventId, event);
      }
      if (event.status === 'cancelled') {
        const previousStatus = lesson.status;
        const row = await lessons.update(lesson.id, { status: 'cancelled' });
        if (contacts) {
          try {
            const contact = await contacts.get(row.contactId);
            await tryNotifyLessonStatus({
              lesson: row,
              previousStatus,
              contact,
              correlationId,
              lessons,
              env,
            });
          } catch {
            // best-effort
          }
        }
        updated += 1;
        continue;
      }
      let response = attendeeResponse(event, elyseEmail);
      if (event.recurrence && lesson.startAt) {
        const instances = await clientWrap.client.listInstances({
          calendarId: lesson.googleCalendarId || 'primary',
          eventId: lesson.googleEventId,
          timeMin: lesson.startAt,
          timeMax: lesson.endAt,
        });
        const instance = instances[0];
        if (instance?.status === 'cancelled') {
          const previousStatus = lesson.status;
          const row = await lessons.update(lesson.id, {
            status: 'cancelled',
            googleInstanceId: instance.id || '',
          });
          if (contacts) {
            try {
              const contact = await contacts.get(row.contactId);
              await tryNotifyLessonStatus({
                lesson: row,
                previousStatus,
                contact,
                correlationId,
                lessons,
                env,
              });
            } catch {
              // best-effort
            }
          }
          updated += 1;
          continue;
        }
        if (instance) {
          response = attendeeResponse(instance, elyseEmail) || response;
        }
      }
      const next = rsvpStatus(response);
      if (next) {
        const previousStatus = lesson.status;
        const row = await lessons.update(lesson.id, { status: next });
        if (contacts) {
          try {
            const contact = await contacts.get(row.contactId);
            await tryNotifyLessonStatus({
              lesson: row,
              previousStatus,
              contact,
              correlationId,
              lessons,
              env,
            });
          } catch {
            // best-effort
          }
        }
        updated += 1;
      }
    } catch (err) {
      if (err?.name === 'GoogleCalendarError' && err.kind === 'google') continue;
      if (isGoogleDisconnectedError(err)) break;
    }
  }
  return { checked: listed.lessons.length, updated };
}

export { MAX_RECURRING_INSTANCES };
