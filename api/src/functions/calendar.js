import { app } from '@azure/functions';
import { forbidden, newCorrelationId, publisherIdentity, signInRequired } from '../lib/auth.js';
import {
  calendarClientConfigured,
  calendarSettingsStoreFromEnv,
} from '../lib/calendarSettings.js';
import {
  CalendarOAuthError,
  createOAuthState,
  exchangeAuthorizationCode,
  fetchGoogleEmail,
  googleAuthUrl,
  readOAuthState,
  refreshAccessToken,
} from '../lib/calendarOAuth.js';
import { createGoogleCalendarClient } from '../lib/googleCalendar.js';
import { requireLessonScheduling } from '../lib/calendarGate.js';
import { calendarFailureResponse } from '../lib/httpErrors.js';
import { PERMISSION, permissionGate } from '../lib/studioAccess.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

function calendarLog(context, message, { correlationId, operation, errorKind }) {
  context.warn(message, { correlationId, operation, errorKind });
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
      route: 'calendar',
      permission,
    });
    await flush();
    const error =
      permission === PERMISSION.CALENDAR_CONNECT
        ? 'This account is signed in but cannot connect Google Calendar.'
        : permission === PERMISSION.CALENDAR_WRITE
          ? 'This account is signed in but cannot edit the schedule.'
          : 'This account is signed in but cannot view the schedule.';
    return { error: forbidden(correlationId, error) };
  }
  return { access: gate.access };
}

async function fail(err, { context, correlationId, operation }) {
  const failure = calendarFailureResponse(err, correlationId);
  calendarLog(context, 'Studio Calendar failed', {
    correlationId,
    operation,
    errorKind: failure.errorKind,
  });
  if (failure.status >= 500) {
    trackException(err, { correlationId, operation, errorKind: failure.errorKind });
  }
  trackEvent('StudioCalendarFailed', {
    correlationId,
    operation,
    errorKind: failure.errorKind,
  });
  await flush();
  return {
    status: failure.status,
    headers: jsonHeaders(),
    jsonBody: failure.jsonBody,
  };
}

function readSettings() {
  return calendarSettingsStoreFromEnv();
}

app.http('calendarStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'calendarStatus',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const scheduling = requireLessonScheduling(correlationId);
    if (scheduling.error) return { ...scheduling.error, headers: jsonHeaders() };
    const authed = await requireCalendar(request, correlationId, PERMISSION.CALENDAR_READ);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };
    try {
      const settings = readSettings();
      const [organizer, elyse, availability, watch] = await Promise.all([
        settings.getConnection('organizer'),
        settings.getConnection('elyse'),
        settings.getAvailability(),
        settings.getWatch(),
      ]);
      let calendars = [];
      if (elyse.connected && calendarClientConfigured()) {
        try {
          const token = await refreshAccessToken(elyse.refreshToken);
          const client = createGoogleCalendarClient({ accessToken: token });
          calendars = await client.listCalendars();
        } catch {
          calendars = [];
        }
      }
      trackEvent('StudioCalendarOp', { correlationId, operation: 'status' });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: {
          ...settings.publicStatus(organizer, elyse, availability, watch),
          calendars,
          oauthConfigured: calendarClientConfigured(),
          correlationId,
        },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation: 'status' });
    }
  },
});

app.http('calendarOAuthStart', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'calendarOAuthStart',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const scheduling = requireLessonScheduling(correlationId);
    if (scheduling.error) return { ...scheduling.error, headers: jsonHeaders() };
    const authed = await requireCalendar(request, correlationId, PERMISSION.CALENDAR_CONNECT);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };
    try {
      const url = new URL(request.url);
      const role = url.searchParams.get('role') === 'elyse' ? 'elyse' : 'organizer';
      const state = createOAuthState(role);
      const authUrl = googleAuthUrl({ role, state });
      trackEvent('StudioCalendarOp', { correlationId, operation: 'oauth_start', role });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: { url: authUrl, role, correlationId },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation: 'oauth_start' });
    }
  },
});

app.http('calendarOAuthCallback', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'calendarOAuthCallback',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const scheduling = requireLessonScheduling(correlationId);
    if (scheduling.error) return { ...scheduling.error, headers: jsonHeaders() };
    const authed = await requireCalendar(request, correlationId, PERMISSION.CALENDAR_CONNECT);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };
    try {
      const body = await request.json();
      const state = readOAuthState(body?.state);
      const tokens = await exchangeAuthorizationCode(body?.code);
      const email = tokens.accessToken ? await fetchGoogleEmail(tokens.accessToken) : '';
      const settings = readSettings();
      await settings.saveConnection(state.role, {
        refreshToken: tokens.refreshToken,
        googleEmail: email,
      });
      trackEvent('StudioCalendarOp', { correlationId, operation: 'oauth_callback', role: state.role });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: { connected: true, role: state.role, email, correlationId },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation: 'oauth_callback' });
    }
  },
});

app.http('calendarDisconnect', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'calendarDisconnect',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const scheduling = requireLessonScheduling(correlationId);
    if (scheduling.error) return { ...scheduling.error, headers: jsonHeaders() };
    const authed = await requireCalendar(request, correlationId, PERMISSION.CALENDAR_CONNECT);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };
    try {
      const body = await request.json().catch(() => ({}));
      const role = body?.role === 'elyse' ? 'elyse' : 'organizer';
      const settings = readSettings();
      await settings.disconnect(role);
      trackEvent('StudioCalendarOp', { correlationId, operation: 'disconnect', role });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: { connected: false, role, correlationId },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation: 'disconnect' });
    }
  },
});

app.http('calendarSettings', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'calendarSettings',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const scheduling = requireLessonScheduling(correlationId);
    if (scheduling.error) return { ...scheduling.error, headers: jsonHeaders() };
    const authed = await requireCalendar(request, correlationId, PERMISSION.CALENDAR_CONNECT);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };
    try {
      const body = await request.json();
      const settings = readSettings();
      const availability = await settings.saveAvailability(body || {});
      trackEvent('StudioCalendarOp', { correlationId, operation: 'settings' });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: { availability, correlationId },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation: 'settings' });
    }
  },
});

app.http('calendarFreeBusy', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'calendarFreeBusy',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const scheduling = requireLessonScheduling(correlationId);
    if (scheduling.error) return { ...scheduling.error, headers: jsonHeaders() };
    const authed = await requireCalendar(request, correlationId, PERMISSION.CALENDAR_READ);
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };
    try {
      const settings = readSettings();
      const elyse = await settings.getConnection('elyse');
      const availability = await settings.getAvailability();
      if (!elyse.connected) {
        return {
          status: 200,
          headers: jsonHeaders(),
          jsonBody: { connected: false, busy: [], availability, correlationId },
        };
      }
      const url = new URL(request.url);
      const timeMin = url.searchParams.get('from') || new Date().toISOString();
      const timeMax =
        url.searchParams.get('to') || new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
      const token = await refreshAccessToken(elyse.refreshToken);
      const client = createGoogleCalendarClient({ accessToken: token });
      const calendarIds = availability.calendarIds.length
        ? availability.calendarIds
        : ['primary'];
      const { busy } = await client.freeBusy({ calendarIds, timeMin, timeMax });
      trackEvent('StudioCalendarOp', { correlationId, operation: 'freebusy' });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: { connected: true, busy, availability, correlationId },
      };
    } catch (err) {
      if (err instanceof CalendarOAuthError || err?.name === 'GoogleCalendarError') {
        return {
          status: 200,
          headers: jsonHeaders(),
          jsonBody: { connected: false, busy: [], correlationId },
        };
      }
      return fail(err, { context, correlationId, operation: 'freebusy' });
    }
  },
});
