/**
 * Transactional Studio email/SMS for lessons and manual templates (STUDIO-P4).
 * Recipients are contact emails — never ALERT-*. Never log bodies or addresses.
 */
import { EmailClient } from '@azure/communication-email';
import { SmsClient } from '@azure/communication-sms';
import { isStagingSite } from './calendarOAuth.js';
import { DEFAULT_LESSON_TIMEZONE } from './lessons.js';
import { studioLessonPayLinksFromEnv } from './lessonPayConfig.js';

export const STUDIO_COMMS_TEMPLATES = [
  'lesson_confirm_resend',
  'lesson_reminder',
  'pay_link',
  'materials_thanks',
];

function requireEnv(name, env = process.env) {
  const value = String(env[name] || '').trim();
  if (!value || value === 'REPLACE_ME') {
    const err = new Error(`Missing ${name}`);
    err.name = 'ContactConfigError';
    throw err;
  }
  return value;
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizeE164(phone) {
  const trimmed = String(phone || '').replace(/[\s().-]/g, '');
  if (trimmed.startsWith('+')) return trimmed;
  if (/^\d{10}$/.test(trimmed)) return `+1${trimmed}`;
  if (/^1\d{10}$/.test(trimmed)) return `+${trimmed}`;
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
}

export function formatLessonWhen(lesson, { locale = 'en-US' } = {}) {
  const tz = lesson?.timezone || DEFAULT_LESSON_TIMEZONE;
  const start = Date.parse(lesson?.startAt || '');
  if (!Number.isFinite(start)) return String(lesson?.startAt || '');
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(start));
}

export function lessonFormatLabel(format) {
  return format === 'nyc' ? 'NYC in person' : 'Zoom';
}

function stagingPrefix(env) {
  return isStagingSite(env) ? '[STAGING] ' : '';
}

async function sendEmail({ to, subject, plainText, html, env = process.env }) {
  const connectionString = requireEnv('ACS_CONNECTION_STRING', env);
  const sender = requireEnv('ACS_EMAIL_SENDER', env);
  const client = new EmailClient(connectionString);
  const poller = await client.beginSend({
    senderAddress: sender,
    recipients: { to: [{ address: to }] },
    content: {
      subject,
      plainText,
      html: html || `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(plainText)}</pre>`,
    },
  });
  const result = await poller.pollUntilDone();
  if (result.status !== 'Succeeded') {
    const err = new Error(`ACS email status: ${result.status}`);
    err.name = 'ContactAcsError';
    throw err;
  }
}

async function sendSms({ to, message, env = process.env }) {
  const from = String(env.ACS_SMS_FROM || '').trim();
  if (!from || from === 'REPLACE_ME') return false;
  const connectionString = requireEnv('ACS_CONNECTION_STRING', env);
  const client = new SmsClient(connectionString);
  const results = await client.send({
    from,
    to: [normalizeE164(to)],
    message,
  });
  const first = results?.[0];
  if (first && first.successful === false) {
    const err = new Error(first.errorMessage || 'ACS SMS send failed');
    err.name = 'ContactAcsError';
    throw err;
  }
  return true;
}

function recipientForContact(contact) {
  const email = String(contact?.email || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error('Contact has no email for lesson mail.');
    err.name = 'StudioCommsError';
    throw err;
  }
  return { email, displayName: String(contact?.displayName || '').trim() };
}

/**
 * @param {{ lesson: object, contact: object, correlationId?: string, env?: object }} args
 */
export async function sendLessonRequestedEmail({ lesson, contact, correlationId, env = process.env }) {
  const { email, displayName } = recipientForContact(contact);
  const when = formatLessonWhen(lesson);
  const format = lessonFormatLabel(lesson.format);
  const prefix = stagingPrefix(env);
  const subject = `${prefix}Voice lesson requested — ${when}`;
  const plainText = [
    `Hi${displayName ? ` ${displayName.split(' ')[0]}` : ''},`,
    '',
    'Your private voice lesson is Requested (not confirmed yet).',
    '',
    `When: ${when}`,
    `Length: ${lesson.durationMin} minutes`,
    `Format: ${format}`,
    '',
    'You will get another email labeled Confirmed when Elyse accepts the invite.',
    'Voice lessons only — vocal pedagogy, vocal health, and CCM.',
    '',
    correlationId ? `Reference: ${correlationId}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  await sendEmail({
    to: email,
    subject,
    plainText,
    env,
  });
}

/**
 * @param {{ lesson: object, contact: object, correlationId?: string, env?: object }} args
 */
export async function sendLessonConfirmedEmail({ lesson, contact, correlationId, env = process.env }) {
  const { email, displayName } = recipientForContact(contact);
  const when = formatLessonWhen(lesson);
  const format = lessonFormatLabel(lesson.format);
  const prefix = stagingPrefix(env);
  const subject = `${prefix}Voice lesson confirmed — ${when}`;
  const plainText = [
    `Hi${displayName ? ` ${displayName.split(' ')[0]}` : ''},`,
    '',
    'Your private voice lesson is Confirmed.',
    '',
    `When: ${when}`,
    `Length: ${lesson.durationMin} minutes`,
    `Format: ${format}`,
    '',
    'See you then. Reply to this thread if you need to reschedule.',
    '',
    correlationId ? `Reference: ${correlationId}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  await sendEmail({ to: email, subject, plainText, env });
}

/**
 * @param {{ lesson: object, contact: object, correlationId?: string, env?: object }} args
 */
export async function sendLessonDeclinedEmail({ lesson, contact, correlationId, env = process.env }) {
  const { email, displayName } = recipientForContact(contact);
  const when = formatLessonWhen(lesson);
  const prefix = stagingPrefix(env);
  const subject = `${prefix}Voice lesson — cannot do that time`;
  const plainText = [
    `Hi${displayName ? ` ${displayName.split(' ')[0]}` : ''},`,
    '',
    `Elyse cannot do the voice lesson time you requested (${when}).`,
    'Please reply or use the site contact form to find another time.',
    '',
    correlationId ? `Reference: ${correlationId}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  await sendEmail({ to: email, subject, plainText, env });
}

/**
 * @param {{ lesson: object, contact: object, correlationId?: string, env?: object, sms?: boolean }} args
 */
export async function sendLessonReminderEmail({
  lesson,
  contact,
  correlationId,
  env = process.env,
  sms = false,
}) {
  const { email, displayName } = recipientForContact(contact);
  const when = formatLessonWhen(lesson);
  const format = lessonFormatLabel(lesson.format);
  const prefix = stagingPrefix(env);
  const subject = `${prefix}Reminder — voice lesson tomorrow`;
  const plainText = [
    `Hi${displayName ? ` ${displayName.split(' ')[0]}` : ''},`,
    '',
    'Reminder: your confirmed private voice lesson is tomorrow.',
    '',
    `When: ${when}`,
    `Length: ${lesson.durationMin} minutes`,
    `Format: ${format}`,
    '',
    correlationId ? `Reference: ${correlationId}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  await sendEmail({ to: email, subject, plainText, env });

  if (sms && contact?.studentSmsOk && contact?.phone) {
    const short = `${prefix}Reminder: voice lesson tomorrow ${when} (${format}).`;
    await sendSms({ to: contact.phone, message: short.slice(0, 320), env });
  }
}

function payLinkBody(env) {
  const links = studioLessonPayLinksFromEnv(env);
  const lines = ['Payment links (private voice lessons only):'];
  if (links?.['30min']) lines.push(`30 minutes: ${links['30min']}`);
  if (links?.['60min']) lines.push(`60 minutes: ${links['60min']}`);
  return lines.join('\n');
}

/**
 * Manual template send (STUDIO-P4-005). Always explicit — never auto from voice.
 * @param {{ template: string, contact: object, lesson?: object, correlationId?: string, env?: object }} args
 */
export async function sendStudioTemplateEmail({
  template,
  contact,
  lesson,
  correlationId,
  env = process.env,
}) {
  const id = String(template || '').trim();
  if (!STUDIO_COMMS_TEMPLATES.includes(id)) {
    const err = new Error('Unknown template.');
    err.name = 'StudioCommsError';
    throw err;
  }
  const { email, displayName } = recipientForContact(contact);
  const prefix = stagingPrefix(env);
  const first = displayName ? displayName.split(' ')[0] : 'there';

  let subject = '';
  let plainText = '';

  if (id === 'lesson_confirm_resend') {
    if (!lesson) throw Object.assign(new Error('Lesson is required for this template.'), { name: 'StudioCommsError' });
    const when = formatLessonWhen(lesson);
    subject = `${prefix}Voice lesson confirmed — ${when}`;
    plainText = [
      `Hi ${first},`,
      '',
      'This is a resend: your private voice lesson is Confirmed.',
      '',
      `When: ${when}`,
      `Length: ${lesson.durationMin} minutes`,
      `Format: ${lessonFormatLabel(lesson.format)}`,
      '',
      correlationId ? `Reference: ${correlationId}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  } else if (id === 'lesson_reminder') {
    if (!lesson) throw Object.assign(new Error('Lesson is required for this template.'), { name: 'StudioCommsError' });
    const when = formatLessonWhen(lesson);
    subject = `${prefix}Reminder — voice lesson`;
    plainText = [
      `Hi ${first},`,
      '',
      'Reminder about your confirmed private voice lesson:',
      '',
      `When: ${when}`,
      `Format: ${lessonFormatLabel(lesson.format)}`,
      '',
      correlationId ? `Reference: ${correlationId}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  } else if (id === 'pay_link') {
    subject = `${prefix}Voice lesson payment link`;
    plainText = [
      `Hi ${first},`,
      '',
      'Here is the payment link for your private voice lesson:',
      '',
      payLinkBody(env),
      '',
      'Pay after you have a confirmed time, or just before we start.',
      '',
      correlationId ? `Reference: ${correlationId}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  } else if (id === 'materials_thanks') {
    subject = `${prefix}Thanks for your materials request`;
    plainText = [
      `Hi ${first},`,
      '',
      'Thanks for reaching out about materials. Elyse will follow up soon.',
      '',
      correlationId ? `Reference: ${correlationId}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  await sendEmail({ to: email, subject, plainText, env });
}

/**
 * Fire-and-forget safe wrapper: logs kinds only; never throws to callers.
 */
export async function tryNotifyLessonStatus({
  lesson,
  previousStatus,
  contact,
  correlationId,
  lessons,
  env = process.env,
}) {
  if (!lesson || !contact?.email) return { sent: false, reason: 'no_email' };
  const next = lesson.status;
  const prev = previousStatus || '';
  if (next === prev) return { sent: false, reason: 'unchanged' };

  try {
    if (next === 'requested' && !lesson.requestedEmailSentAt) {
      await sendLessonRequestedEmail({ lesson, contact, correlationId, env });
      if (lessons) {
        await lessons.update(lesson.id, { requestedEmailSentAt: new Date().toISOString() });
      }
      return { sent: true, kind: 'requested' };
    }
    if (next === 'confirmed' && prev !== 'confirmed' && !lesson.confirmedEmailSentAt) {
      await sendLessonConfirmedEmail({ lesson, contact, correlationId, env });
      if (lessons) {
        await lessons.update(lesson.id, { confirmedEmailSentAt: new Date().toISOString() });
      }
      return { sent: true, kind: 'confirmed' };
    }
    if (next === 'declined' && prev !== 'declined') {
      await sendLessonDeclinedEmail({ lesson, contact, correlationId, env });
      return { sent: true, kind: 'declined' };
    }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.name : 'error' };
  }
  return { sent: false, reason: 'skipped' };
}

export function tomorrowWindowInTimeZone(timeZone = DEFAULT_LESSON_TIMEZONE, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const todayUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const tomorrowUtc = todayUtc + 86_400_000;
  const tomorrow = new Date(tomorrowUtc);
  const tomorrowParts = {
    year: tomorrow.getUTCFullYear(),
    month: String(tomorrow.getUTCMonth() + 1).padStart(2, '0'),
    day: String(tomorrow.getUTCDate()).padStart(2, '0'),
  };
  const dayKey = `${tomorrowParts.year}-${tomorrowParts.month}-${tomorrowParts.day}`;
  const startIso = localWallInZoneToIso(`${dayKey}T00:00:00`, timeZone);
  const endIso = localWallInZoneToIso(`${dayKey}T23:59:59`, timeZone);
  return { dayKey, startIso, endIso, timeZone };
}

function localWallInZoneToIso(wall, timeZone) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})$/.exec(wall);
  if (!match) return '';
  const asUtc = new Date(`${match[1]}T${match[2]}Z`);
  const offsetMs = timeZoneOffsetMs(asUtc, timeZone);
  return new Date(asUtc.getTime() - offsetMs).toISOString();
}

function timeZoneOffsetMs(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - date.getTime();
}
