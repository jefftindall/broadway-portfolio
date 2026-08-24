/**
 * Google Calendar REST client. Never log tokens, attendee emails, or event bodies.
 */
import {
  CalendarOAuthError,
  calendarWatchUrl,
  isStagingSite,
  refreshAccessToken,
  studioEnvironment,
} from './calendarOAuth.js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export class GoogleCalendarError extends Error {
  constructor(message = 'google_calendar_failed', { kind = 'google', status = 500 } = {}) {
    super(message);
    this.name = 'GoogleCalendarError';
    this.kind = kind;
    this.status = status;
  }
}

function classifyHttp(status) {
  if (status === 401 || status === 403) return { kind: 'revoked', status: 503 };
  if (status === 429) return { kind: 'quota', status: 503 };
  if (status >= 500) return { kind: 'google_temporary', status: 503 };
  return { kind: 'google', status: 502 };
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function calendarFetch(accessToken, path, { method = 'GET', query, body, timeoutMs = 12_000 } = {}) {
  const url = new URL(`${CALENDAR_API}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const json = await readJson(response);
    if (!response.ok) {
      const classified = classifyHttp(response.status);
      throw new GoogleCalendarError('google_calendar_http', classified);
    }
    return json;
  } catch (err) {
    if (err instanceof GoogleCalendarError) throw err;
    if (err?.name === 'AbortError') {
      throw new GoogleCalendarError('google_calendar_timeout', { kind: 'timeout', status: 503 });
    }
    throw new GoogleCalendarError('google_calendar_network', { kind: 'timeout', status: 503 });
  } finally {
    clearTimeout(timer);
  }
}

export async function accessTokenForRefresh(refreshToken, env = process.env) {
  try {
    return await refreshAccessToken(refreshToken, env);
  } catch (err) {
    if (err instanceof CalendarOAuthError) {
      throw new GoogleCalendarError(err.message, { kind: err.kind, status: 503 });
    }
    throw err;
  }
}

export function lessonExtendedProperties({ lessonId, contactId, seriesId, environment }) {
  return {
    private: {
      studioLessonId: String(lessonId || ''),
      studioContactId: String(contactId || ''),
      ...(seriesId ? { studioSeriesId: String(seriesId) } : {}),
      ...(environment ? { studioEnvironment: String(environment) } : {}),
    },
  };
}

export function lessonEventCopy(env = process.env) {
  const staging = isStagingSite(env);
  return {
    summary: staging ? '[STAGING] Voice lesson' : 'Voice lesson',
    description: staging
      ? 'STAGING test invite — not a real lesson. Requested until Elyse accepts this invite.'
      : 'Studio voice lesson. Requested until Elyse accepts this invite.',
    transparency: staging ? 'transparent' : 'opaque',
    environment: studioEnvironment(env),
  };
}

export function buildLessonEvent({
  lesson,
  elyseEmail,
  studentEmail,
  recurringCount,
  env = process.env,
}) {
  const copy = lessonEventCopy(env);
  const event = {
    summary: copy.summary,
    description: copy.description,
    transparency: copy.transparency,
    start: { dateTime: lesson.startAt, timeZone: lesson.timezone },
    end: { dateTime: lesson.endAt, timeZone: lesson.timezone },
    attendees: [],
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    extendedProperties: lessonExtendedProperties({
      lessonId: lesson.id,
      contactId: lesson.contactId,
      seriesId: lesson.seriesId,
      environment: copy.environment,
    }),
  };
  if (elyseEmail) {
    event.attendees.push({ email: elyseEmail, responseStatus: 'needsAction' });
  }
  if (studentEmail) {
    event.attendees.push({ email: studentEmail, responseStatus: 'needsAction' });
  }
  if (recurringCount && recurringCount > 1) {
    event.recurrence = [`RRULE:FREQ=WEEKLY;COUNT=${recurringCount}`];
  }
  return event;
}

export function createGoogleCalendarClient({ accessToken }) {
  if (!accessToken) {
    throw new GoogleCalendarError('missing_access_token', { kind: 'config', status: 500 });
  }

  return {
    async listCalendars() {
      const data = await calendarFetch(accessToken, '/users/me/calendarList');
      return (data.items || []).map((item) => ({
        id: item.id,
        summary: item.summary || item.id,
        primary: Boolean(item.primary),
        accessRole: item.accessRole || '',
      }));
    },

    async freeBusy({ calendarIds, timeMin, timeMax }) {
      const ids = (calendarIds || []).filter(Boolean);
      if (!ids.length) return { busy: [] };
      const data = await calendarFetch(accessToken, '/freeBusy', {
        method: 'POST',
        body: {
          timeMin,
          timeMax,
          items: ids.map((id) => ({ id })),
        },
      });
      const busy = [];
      for (const [calendarId, cal] of Object.entries(data.calendars || {})) {
        for (const slot of cal.busy || []) {
          busy.push({ calendarId, start: slot.start, end: slot.end });
        }
      }
      return { busy };
    },

    async insertEvent({ calendarId = 'primary', event, sendUpdates = 'all' }) {
      return calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        query: { sendUpdates, conferenceDataVersion: 0 },
        body: event,
      });
    },

    async getEvent({ calendarId = 'primary', eventId }) {
      return calendarFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      );
    },

    async patchEvent({ calendarId = 'primary', eventId, event, sendUpdates = 'all' }) {
      return calendarFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { method: 'PATCH', query: { sendUpdates }, body: event },
      );
    },

    async deleteEvent({ calendarId = 'primary', eventId, sendUpdates = 'all' }) {
      try {
        await calendarFetch(
          accessToken,
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
          { method: 'DELETE', query: { sendUpdates } },
        );
      } catch (err) {
        if (err instanceof GoogleCalendarError && err.kind === 'google' && err.status === 502) {
          return;
        }
        throw err;
      }
    },

    async listInstances({ calendarId = 'primary', eventId, timeMin, timeMax }) {
      const data = await calendarFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/instances`,
        { query: { timeMin, timeMax, maxResults: 25 } },
      );
      return data.items || [];
    },

    async watchEvents({ calendarId = 'primary', channelId, token, address, expirationMs }) {
      return calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
        method: 'POST',
        body: {
          id: channelId,
          type: 'web_hook',
          address: address || calendarWatchUrl(),
          token,
          ...(expirationMs ? { expiration: String(expirationMs) } : {}),
        },
      });
    },

    async stopChannel({ channelId, resourceId }) {
      if (!channelId || !resourceId) return;
      try {
        await calendarFetch(accessToken, '/channels/stop', {
          method: 'POST',
          body: { id: channelId, resourceId },
        });
      } catch {
        // Stopping an expired channel is not an operator-facing failure.
      }
    },

    async listEvents({ calendarId = 'primary', timeMin, timeMax, syncToken, updatedMin }) {
      return calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
        query: {
          timeMin,
          timeMax,
          syncToken,
          updatedMin,
          singleEvents: 'true',
          maxResults: 250,
        },
      });
    },
  };
}

export function attendeeResponse(event, email) {
  const wanted = String(email || '')
    .trim()
    .toLowerCase();
  if (!wanted || !event) return '';
  const match = (event.attendees || []).find(
    (row) => String(row.email || '').trim().toLowerCase() === wanted,
  );
  return String(match?.responseStatus || '').trim().toLowerCase();
}

export function isGoogleDisconnectedError(err) {
  return (
    err instanceof GoogleCalendarError &&
    (err.kind === 'revoked' || err.kind === 'timeout' || err.kind === 'quota' || err.kind === 'google_temporary')
  );
}
