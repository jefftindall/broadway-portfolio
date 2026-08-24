/**
 * ICS METHOD:REQUEST for degraded Calendar (email to SITE-CONTACT-EMAIL).
 * UID is the Studio lesson id so a later Google connect can match.
 */
import { DEFAULT_LESSON_TIMEZONE } from './lessons.js';

function foldLine(line) {
  const text = String(line);
  if (text.length <= 75) return text;
  const chunks = [];
  let remaining = text;
  chunks.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length) {
    chunks.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  return chunks.join('\r\n');
}

function escapeText(value) {
  return String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;');
}

function toIcsUtc(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildLessonRequestIcs({
  lesson,
  organizerEmail,
  attendeeEmail,
  summary = 'Voice lesson request',
  description = 'Requested — you’ll get Confirmed when Elyse accepts.',
}) {
  const uid = `${lesson.id}@elysetindall.com`;
  const dtStart = toIcsUtc(lesson.startAt);
  const dtEnd = toIcsUtc(lesson.endAt);
  const dtStamp = toIcsUtc(new Date().toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Elyse Tindall Studio//Lesson//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${lesson.format === 'nyc' ? 'NYC in person' : 'Zoom'}`,
  ];
  if (organizerEmail) {
    lines.push(`ORGANIZER:MAILTO:${organizerEmail}`);
  }
  if (attendeeEmail) {
    lines.push(
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:MAILTO:${attendeeEmail}`,
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function lessonIcsUid(lessonId) {
  return `${lessonId}@elysetindall.com`;
}

export { DEFAULT_LESSON_TIMEZONE };
