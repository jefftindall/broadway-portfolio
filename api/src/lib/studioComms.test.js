import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STUDIO_COMMS_TEMPLATES,
  formatLessonWhen,
  lessonFormatLabel,
  tomorrowWindowInTimeZone,
} from './studioComms.js';

test('STUDIO_COMMS_TEMPLATES lists manual templates', () => {
  assert.deepEqual(STUDIO_COMMS_TEMPLATES, [
    'lesson_confirm_resend',
    'lesson_reminder',
    'pay_link',
    'materials_thanks',
  ]);
});

test('formatLessonWhen uses lesson timezone', () => {
  const text = formatLessonWhen({
    startAt: '2026-08-25T18:00:00.000Z',
    timezone: 'America/New_York',
  });
  assert.match(text, /August/);
  assert.match(text, /25/);
});

test('lessonFormatLabel maps nyc and zoom', () => {
  assert.equal(lessonFormatLabel('nyc'), 'NYC in person');
  assert.equal(lessonFormatLabel('zoom'), 'Zoom');
});

test('tomorrowWindowInTimeZone returns a day key and bounds', () => {
  const { dayKey, startIso, endIso } = tomorrowWindowInTimeZone(
    'America/New_York',
    new Date('2026-08-24T12:00:00Z'),
  );
  assert.match(dayKey, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Date.parse(startIso) < Date.parse(endIso));
});
