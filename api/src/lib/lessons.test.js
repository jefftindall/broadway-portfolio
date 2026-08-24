import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryTableClient } from './contacts.js';
import { classifyCalendarError } from './httpErrors.js';
import {
  DEFAULT_RECURRING_INSTANCES,
  LessonConfigError,
  LessonValidationError,
  MAX_RECURRING_INSTANCES,
  addWeeksToWall,
  createLessonsStore,
  lessonsStoreFromEnv,
  localWallTimeToIso,
  normalizeLessonInput,
  normalizeRecurringCount,
} from './lessons.js';
import { createLessonsWithCalendar } from './lessonWorkflow.js';

function store() {
  return createLessonsStore({ tableClient: new MemoryTableClient() });
}

test('lessonsStoreFromEnv requires a real connection string', () => {
  assert.throws(
    () => lessonsStoreFromEnv({ STUDIO_CRM_STORAGE_CONNECTION_STRING: 'REPLACE_ME' }),
    LessonConfigError,
  );
});

test('normalizeLessonInput requires student, start, format, and 30/60 minutes', () => {
  assert.throws(() => normalizeLessonInput({ startAt: '2026-09-01T16:00', format: 'zoom', durationMin: 60 }), LessonValidationError);
  assert.throws(
    () =>
      normalizeLessonInput({
        contactId: 'c1',
        startAt: '2026-09-01T16:00',
        format: 'scene',
        durationMin: 60,
      }),
    LessonValidationError,
  );
  const ok = normalizeLessonInput({
    contactId: 'c1',
    startAt: '2026-09-01T16:00',
    format: 'Zoom',
    durationMin: 30,
  });
  assert.equal(ok.contactId, 'c1');
  assert.equal(ok.format, 'zoom');
  assert.equal(ok.durationMin, 30);
  assert.ok(ok.startAt.endsWith('Z'));
  assert.ok(ok.endAt > ok.startAt);
});

test('localWallTimeToIso treats America/New_York wall time as Eastern', () => {
  const winter = localWallTimeToIso('2026-01-15T16:00', 'America/New_York');
  assert.equal(winter, '2026-01-15T21:00:00.000Z');
  const summer = localWallTimeToIso('2026-07-15T16:00', 'America/New_York');
  assert.equal(summer, '2026-07-15T20:00:00.000Z');
});

test('weekly series is capped at 12 instances', () => {
  assert.equal(normalizeRecurringCount(undefined), DEFAULT_RECURRING_INSTANCES);
  assert.equal(normalizeRecurringCount(12), MAX_RECURRING_INSTANCES);
  assert.throws(() => normalizeRecurringCount(13), /12/);
  assert.throws(() => normalizeRecurringCount(0), LessonValidationError);
});

test('addWeeksToWall keeps the clock time and advances the date', () => {
  assert.equal(addWeeksToWall('2026-09-01T16:00', 1), '2026-09-08T16:00');
  assert.equal(addWeeksToWall('2026-09-01T16:00', 11), '2026-11-17T16:00');
});

test('create + list + status update stay on the lessons partition', async () => {
  const lessons = store();
  const created = await lessons.create({
    contactId: 'student-1',
    startAt: '2026-09-01T16:00',
    durationMin: 60,
    format: 'zoom',
  });
  assert.equal(created.status, 'requested');
  assert.equal(created.contactId, 'student-1');
  const listed = await lessons.list({ contactId: 'student-1' });
  assert.equal(listed.total, 1);
  const confirmed = await lessons.update(created.id, { status: 'confirmed' });
  assert.equal(confirmed.status, 'confirmed');
  assert.ok(confirmed.confirmedAt);
});

test('recurring create persists 12 requested rows before any Google call', async () => {
  const lessons = store();
  const contacts = {
    async get(id) {
      return { id, displayName: 'Ada', email: '', archived: false };
    },
  };
  const result = await createLessonsWithCalendar({
    body: {
      contactId: 'student-1',
      startAt: '2026-09-01T16:00',
      durationMin: 60,
      format: 'zoom',
      recurring: true,
      recurringCount: 12,
    },
    lessons,
    contacts,
    settings: null,
    env: {},
    correlationId: 'test-ref',
  });
  assert.equal(result.lessons.length, 12);
  assert.equal(result.lessons[0].status, 'requested');
  assert.ok(result.lessons[0].seriesId);
  assert.equal(result.lessons.every((row) => row.seriesId === result.lessons[0].seriesId), true);
  assert.equal(result.calendar.connected, false);
});

test('classifyCalendarError never returns raw Google messages', () => {
  const err = new Error('invalid_grant: Token has been expired or revoked');
  err.name = 'CalendarOAuthError';
  err.kind = 'revoked';
  const classified = classifyCalendarError(err);
  assert.equal(classified.status, 503);
  assert.equal(/invalid_grant|revoked token/i.test(classified.error), false);
});
