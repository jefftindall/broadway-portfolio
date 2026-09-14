import assert from 'node:assert/strict';
import test from 'node:test';
import { computeOpenSlots } from './lessonSlots.js';

test('computeOpenSlots returns empty when busy covers the window', () => {
  const now = Date.parse('2026-06-01T12:00:00.000Z');
  const slots = computeOpenSlots({
    busy: [{ start: '2026-06-01T00:00:00.000Z', end: '2026-06-15T00:00:00.000Z' }],
    availability: { timezone: 'America/New_York', bufferMinutes: 15, minNoticeHours: 0 },
    durationMin: 60,
    now,
  });
  assert.equal(slots.length, 0);
});

test('computeOpenSlots respects min notice and busy gaps', () => {
  const now = Date.parse('2026-06-02T10:00:00.000Z');
  const slots = computeOpenSlots({
    busy: [
      {
        start: '2026-06-03T13:00:00.000Z',
        end: '2026-06-03T15:00:00.000Z',
      },
    ],
    availability: { timezone: 'America/New_York', bufferMinutes: 0, minNoticeHours: 12 },
    durationMin: 60,
    now,
  });
  assert.ok(slots.length > 0);
  for (const slot of slots) {
    assert.equal(slot.durationMin, 60);
    assert.ok(Date.parse(slot.startAt) >= now + 12 * 60 * 60 * 1000);
  }
  const conflict = slots.find((slot) => {
    const start = Date.parse(slot.startAt);
    const end = start + 60 * 60 * 1000;
    const busyStart = Date.parse('2026-06-03T13:00:00.000Z');
    const busyEnd = Date.parse('2026-06-03T15:00:00.000Z');
    return start < busyEnd && end > busyStart;
  });
  assert.equal(conflict, undefined);
});

test('computeOpenSlots normalizes duration to 30 or 60 minutes', () => {
  const now = Date.parse('2026-06-02T10:00:00.000Z');
  const slots = computeOpenSlots({
    busy: [],
    availability: { timezone: 'America/New_York', bufferMinutes: 0, minNoticeHours: 0 },
    durationMin: 45,
    now,
  });
  assert.ok(slots.length > 0);
  assert.ok(slots.every((slot) => slot.durationMin === 60));
});
