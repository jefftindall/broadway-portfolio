import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLessonEvent, lessonEventCopy } from './googleCalendar.js';

const stagingEnv = { SITE_URL: 'https://test.elysetindall.com' };
const prodEnv = { SITE_URL: 'https://elysetindall.com' };

const lesson = {
  id: 'lesson-1',
  contactId: 'contact-1',
  startAt: '2026-09-01T20:00:00.000Z',
  endAt: '2026-09-01T21:00:00.000Z',
  timezone: 'America/New_York',
  format: 'zoom',
};

test('lessonEventCopy labels staging invites and marks them transparent', () => {
  const staging = lessonEventCopy(stagingEnv);
  assert.equal(staging.summary, '[STAGING] Voice lesson');
  assert.equal(staging.transparency, 'transparent');
  assert.equal(staging.environment, 'staging');

  const prod = lessonEventCopy(prodEnv);
  assert.equal(prod.summary, 'Voice lesson');
  assert.equal(prod.transparency, 'opaque');
  assert.equal(prod.environment, 'production');
});

test('buildLessonEvent stores studioEnvironment in extended properties', () => {
  const stagingEvent = buildLessonEvent({
    lesson,
    elyseEmail: 'coach@example.com',
    studentEmail: 'student@example.com',
    env: stagingEnv,
  });
  assert.equal(stagingEvent.summary, '[STAGING] Voice lesson');
  assert.equal(stagingEvent.transparency, 'transparent');
  assert.equal(stagingEvent.extendedProperties.private.studioEnvironment, 'staging');

  const prodEvent = buildLessonEvent({
    lesson,
    elyseEmail: 'coach@example.com',
    env: prodEnv,
  });
  assert.equal(prodEvent.summary, 'Voice lesson');
  assert.equal(prodEvent.transparency, 'opaque');
  assert.equal(prodEvent.extendedProperties.private.studioEnvironment, 'production');
});
