import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryTableClient } from './contacts.js';
import {
  CalendarValidationError,
  calendarClientConfigured,
  createCalendarSettingsStore,
} from './calendarSettings.js';
import {
  createOAuthState,
  isStagingSite,
  publicSiteUrl,
  readOAuthState,
  studioEnvironment,
} from './calendarOAuth.js';
import { buildLessonRequestIcs, lessonIcsCopy, lessonIcsUid } from './ics.js';
import { createLessonActionToken, readLessonActionToken } from './lessonActions.js';

const env = {
  GOOGLE_CALENDAR_CLIENT_ID: 'client-id',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
  SITE_URL: 'https://test.elysetindall.com',
};

test('publicSiteUrl strips a trailing slash', () => {
  assert.equal(publicSiteUrl({ SITE_URL: 'https://elysetindall.com/' }), 'https://elysetindall.com');
});

test('isStagingSite detects staging hostnames', () => {
  assert.equal(isStagingSite({ SITE_URL: 'https://test.elysetindall.com' }), true);
  assert.equal(isStagingSite({ SITE_URL: 'https://happy-abc.azurestaticapps.net' }), true);
  assert.equal(isStagingSite({ SITE_URL: 'https://elysetindall.com' }), false);
  assert.equal(studioEnvironment({ SITE_URL: 'https://test.elysetindall.com' }), 'staging');
  assert.equal(studioEnvironment({ SITE_URL: 'https://elysetindall.com' }), 'production');
});

test('OAuth state is bound to a role and expires', () => {
  const state = createOAuthState('organizer', env);
  const payload = readOAuthState(state, env);
  assert.equal(payload.role, 'organizer');
  assert.throws(() => readOAuthState(state.slice(0, -2) + 'xx', env), CalendarValidationError);
});

test('calendar settings never expose refresh tokens on publicStatus', async () => {
  const settings = createCalendarSettingsStore({
    tableClient: new MemoryTableClient(),
    env: { GOOGLE_CALENDAR_ORGANIZER_REFRESH_TOKEN: 'env-refresh' },
  });
  await settings.saveConnection('organizer', {
    refreshToken: 'table-refresh',
    googleEmail: 'studio@example.com',
  });
  const organizer = await settings.getConnection('organizer');
  assert.equal(organizer.connected, true);
  assert.equal(organizer.refreshToken, 'table-refresh');
  const publicStatus = settings.publicStatus(
    organizer,
    { connected: false, email: '' },
    { calendarIds: [] },
    {},
  );
  assert.equal(publicStatus.organizer.connected, true);
  assert.equal(publicStatus.organizer.email, 'studio@example.com');
  assert.equal(JSON.stringify(publicStatus).includes('refresh'), false);
});

test('disconnect overrides an env refresh token fallback', async () => {
  const settings = createCalendarSettingsStore({
    tableClient: new MemoryTableClient(),
    env: { GOOGLE_CALENDAR_ORGANIZER_REFRESH_TOKEN: 'env-refresh' },
  });
  assert.equal((await settings.getConnection('organizer')).connected, true);
  await settings.disconnect('organizer');
  assert.equal((await settings.getConnection('organizer')).connected, false);
});

test('ICS METHOD:REQUEST uses the lesson id as UID', () => {
  const ics = buildLessonRequestIcs({
    lesson: {
      id: 'lesson-123',
      startAt: '2026-09-01T20:00:00.000Z',
      endAt: '2026-09-01T21:00:00.000Z',
      format: 'zoom',
    },
    organizerEmail: 'studio@example.com',
    attendeeEmail: 'coach@example.com',
  });
  assert.match(ics, /METHOD:REQUEST/);
  assert.match(ics, /UID:lesson-123@elysetindall.com/);
  assert.equal(lessonIcsUid('lesson-123'), 'lesson-123@elysetindall.com');
});

test('staging ICS is labeled and transparent', () => {
  const copy = lessonIcsCopy({ SITE_URL: 'https://test.elysetindall.com' });
  assert.match(copy.summary, /^\[STAGING\]/);
  assert.equal(copy.transparent, true);

  const ics = buildLessonRequestIcs({
    lesson: {
      id: 'lesson-stg',
      startAt: '2026-09-01T20:00:00.000Z',
      endAt: '2026-09-01T21:00:00.000Z',
      format: 'zoom',
    },
    organizerEmail: 'studio@example.com',
    attendeeEmail: 'coach@example.com',
    env: { SITE_URL: 'https://test.elysetindall.com' },
  });
  assert.match(ics, /SUMMARY:\[STAGING\]/);
  assert.match(ics, /TRANSP:TRANSPARENT/);
});

test('lesson action tokens round-trip confirm and decline', () => {
  const token = createLessonActionToken('lesson-123', 'confirm', env);
  const payload = readLessonActionToken(token, env);
  assert.equal(payload.lessonId, 'lesson-123');
  assert.equal(payload.action, 'confirm');
  assert.throws(() => readLessonActionToken('nope', env));
});

test('calendarClientConfigured rejects REPLACE_ME', () => {
  assert.equal(calendarClientConfigured({}), false);
  assert.equal(
    calendarClientConfigured({
      GOOGLE_CALENDAR_CLIENT_ID: 'REPLACE_ME',
      GOOGLE_CALENDAR_CLIENT_SECRET: 'secret',
    }),
    false,
  );
  assert.equal(
    calendarClientConfigured({
      GOOGLE_CALENDAR_CLIENT_ID: 'id',
      GOOGLE_CALENDAR_CLIENT_SECRET: 'secret',
    }),
    true,
  );
});
