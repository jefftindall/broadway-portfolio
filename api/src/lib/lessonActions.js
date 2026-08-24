/**
 * Signed one-click Confirm / Decline links for ICS fallback email (degraded mode).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { CalendarOAuthError, publicSiteUrl } from './calendarOAuth.js';
import { LessonValidationError } from './lessons.js';

const ACTIONS = ['confirm', 'decline'];
const TTL_MS = 21 * 24 * 60 * 60 * 1000;

function usableSecret(value) {
  const trimmed = String(value || '').trim();
  return Boolean(trimmed) && trimmed !== 'REPLACE_ME';
}

function actionSecret(env = process.env) {
  const secret = env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!usableSecret(secret)) {
    throw new CalendarOAuthError('missing google_calendar_client', { kind: 'config' });
  }
  return String(secret).trim();
}

function sign(payload, env) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const mac = createHmac('sha256', actionSecret(env)).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function createLessonActionToken(lessonId, action, env = process.env) {
  if (!ACTIONS.includes(action)) {
    throw new LessonValidationError('Unknown lesson action.');
  }
  return sign(
    {
      lessonId: String(lessonId || '').trim(),
      action,
      exp: Date.now() + TTL_MS,
    },
    env,
  );
}

export function readLessonActionToken(token, env = process.env) {
  const text = String(token || '');
  const dot = text.lastIndexOf('.');
  if (dot < 1) throw new LessonValidationError('That lesson link is invalid or expired.');
  const body = text.slice(0, dot);
  const mac = text.slice(dot + 1);
  const expected = createHmac('sha256', actionSecret(env)).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new LessonValidationError('That lesson link is invalid or expired.');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new LessonValidationError('That lesson link is invalid or expired.');
  }
  if (!ACTIONS.includes(payload.action) || !payload.lessonId || Number(payload.exp) < Date.now()) {
    throw new LessonValidationError('That lesson link is invalid or expired.');
  }
  return payload;
}

export function lessonActionUrl(lessonId, action, env = process.env) {
  const token = createLessonActionToken(lessonId, action, env);
  const params = new URLSearchParams({ t: token });
  return `${publicSiteUrl(env)}/api/lessonAction?${params.toString()}`;
}
