/**
 * Public lesson slot candidates from Google free/busy + studio availability rules.
 * Never invent open times when busy data is missing — return an empty list.
 */
import { localWallTimeToIso } from './lessons.js';
import { slotConflicts, violatesMinNotice } from './lessonWorkflow.js';

export const PUBLIC_SLOT_WINDOW_DAYS = 14;
export const PUBLIC_SLOT_START_HOUR = 9;
export const PUBLIC_SLOT_END_HOUR = 20;
export const PUBLIC_SLOT_INCREMENT_MIN = 30;

function dateKeysInTimezone(timeZone, from = new Date(), days = PUBLIC_SLOT_WINDOW_DAYS) {
  const keys = [];
  const cursor = new Date(from.getTime());
  for (let i = 0; i < days; i += 1) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(cursor)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    keys.push(`${parts.year}-${parts.month}-${parts.day}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function wallTimesForDay({ dateKey, durationMin, startHour, endHour }) {
  const latestHour = endHour - Math.ceil(durationMin / 60);
  const walls = [];
  for (let hour = startHour; hour <= latestHour; hour += 1) {
    for (const minute of [0, 30]) {
      if (hour === latestHour && minute === 30 && durationMin > 30) continue;
      if (hour * 60 + minute + durationMin > endHour * 60) continue;
      walls.push(
        `${dateKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      );
    }
  }
  return walls;
}

/**
 * @param {{
 *   busy: { start: string, end: string }[],
 *   availability?: { timezone?: string, bufferMinutes?: number, minNoticeHours?: number },
 *   durationMin: number,
 *   now?: number,
 * }} input
 * @returns {{ startAt: string, durationMin: number }[]}
 */
export function computeOpenSlots({
  busy,
  availability,
  durationMin,
  now = Date.now(),
}) {
  const duration = Number(durationMin) === 30 ? 30 : 60;
  const timeZone = availability?.timezone || 'America/New_York';
  const bufferMinutes = Number(availability?.bufferMinutes ?? 15);
  const minNoticeHours = Number(availability?.minNoticeHours ?? 12);
  const slots = [];
  const seen = new Set();

  for (const dateKey of dateKeysInTimezone(timeZone, new Date(now))) {
    for (const wall of wallTimesForDay({
      dateKey,
      durationMin: duration,
      startHour: PUBLIC_SLOT_START_HOUR,
      endHour: PUBLIC_SLOT_END_HOUR,
    })) {
      let startAt;
      try {
        startAt = localWallTimeToIso(wall, timeZone);
      } catch {
        continue;
      }
      const endAt = new Date(Date.parse(startAt) + duration * 60_000).toISOString();
      if (violatesMinNotice(startAt, minNoticeHours, now)) continue;
      if (
        slotConflicts({
          startAt,
          endAt,
          busy,
          bufferMinutes,
        })
      ) {
        continue;
      }
      const key = `${startAt}:${duration}`;
      if (seen.has(key)) continue;
      seen.add(key);
      slots.push({ startAt, durationMin: duration });
    }
  }

  return slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
}
