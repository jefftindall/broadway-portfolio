/**
 * Google OAuth 2.0 for Studio Calendar (authorization code + offline refresh).
 * Never log codes, tokens, or state secrets.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { CalendarValidationError, CALENDAR_ROLES } from './calendarSettings.js';

const ORGANIZER_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

const ELYSE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/userinfo.email',
];

export class CalendarOAuthError extends Error {
  constructor(message = 'google_oauth_failed', { kind = 'oauth' } = {}) {
    super(message);
    this.name = 'CalendarOAuthError';
    this.kind = kind;
  }
}

function usableSecret(value) {
  const trimmed = String(value || '').trim();
  return Boolean(trimmed) && trimmed !== 'REPLACE_ME';
}

export function publicSiteUrl(env = process.env) {
  const raw = String(env.SITE_URL || env.PUBLIC_SITE_URL || 'https://elysetindall.com').trim();
  return raw.replace(/\/+$/, '') || 'https://elysetindall.com';
}

/** Staging host or SWA default hostname — not production portfolio. */
export function isStagingSite(env = process.env) {
  try {
    const host = new URL(publicSiteUrl(env)).hostname.toLowerCase();
    return host === 'test.elysetindall.com' || host.endsWith('.azurestaticapps.net');
  } catch {
    return false;
  }
}

/** Label for Google extended properties and invite copy. */
export function studioEnvironment(env = process.env) {
  return isStagingSite(env) ? 'staging' : 'production';
}

export function calendarOAuthRedirectUri(env = process.env) {
  return `${publicSiteUrl(env)}/studio/admin/calendar`;
}

export function calendarWatchUrl(env = process.env) {
  return `${publicSiteUrl(env)}/api/calendarWatch`;
}

function stateSecret(env = process.env) {
  const secret = env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!usableSecret(secret)) {
    throw new CalendarOAuthError('missing google_calendar_client', { kind: 'config' });
  }
  return String(secret).trim();
}

function signPayload(payload, env) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const mac = createHmac('sha256', stateSecret(env)).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verifySigned(token, env) {
  const text = String(token || '');
  const dot = text.lastIndexOf('.');
  if (dot < 1) throw new CalendarValidationError('That Google sign-in link is invalid or expired.');
  const body = text.slice(0, dot);
  const mac = text.slice(dot + 1);
  const expected = createHmac('sha256', stateSecret(env)).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new CalendarValidationError('That Google sign-in link is invalid or expired.');
  }
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new CalendarValidationError('That Google sign-in link is invalid or expired.');
  }
}

export function createOAuthState(role, env = process.env) {
  if (!CALENDAR_ROLES.includes(role)) {
    throw new CalendarValidationError('Unknown Calendar role.');
  }
  return signPayload(
    {
      role,
      nonce: randomBytes(16).toString('hex'),
      exp: Date.now() + 15 * 60_000,
    },
    env,
  );
}

export function readOAuthState(state, env = process.env) {
  const payload = verifySigned(state, env);
  if (!CALENDAR_ROLES.includes(payload.role) || Number(payload.exp) < Date.now()) {
    throw new CalendarValidationError('That Google sign-in link is invalid or expired.');
  }
  return payload;
}

export function googleAuthUrl({ role, state, env = process.env }) {
  const clientId = String(env.GOOGLE_CALENDAR_CLIENT_ID || '').trim();
  if (!usableSecret(clientId) || !usableSecret(env.GOOGLE_CALENDAR_CLIENT_SECRET)) {
    throw new CalendarOAuthError('missing google_calendar_client', { kind: 'config' });
  }
  const scopes = role === 'elyse' ? ELYSE_SCOPES : ORGANIZER_SCOPES;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: calendarOAuthRedirectUri(env),
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export async function exchangeAuthorizationCode(code, env = process.env) {
  const clientId = String(env.GOOGLE_CALENDAR_CLIENT_ID || '').trim();
  const clientSecret = String(env.GOOGLE_CALENDAR_CLIENT_SECRET || '').trim();
  if (!usableSecret(clientId) || !usableSecret(clientSecret)) {
    throw new CalendarOAuthError('missing google_calendar_client', { kind: 'config' });
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(code || '').trim(),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: calendarOAuthRedirectUri(env),
      grant_type: 'authorization_code',
    }),
  });
  const body = await readJson(response);
  if (!response.ok || !body.refresh_token) {
    const kind = response.status === 401 || response.status === 403 ? 'revoked' : 'oauth';
    throw new CalendarOAuthError('google_oauth_exchange_failed', { kind });
  }
  return {
    refreshToken: String(body.refresh_token),
    accessToken: String(body.access_token || ''),
  };
}

export async function refreshAccessToken(refreshToken, env = process.env) {
  const clientId = String(env.GOOGLE_CALENDAR_CLIENT_ID || '').trim();
  const clientSecret = String(env.GOOGLE_CALENDAR_CLIENT_SECRET || '').trim();
  if (!usableSecret(clientId) || !usableSecret(clientSecret) || !usableSecret(refreshToken)) {
    throw new CalendarOAuthError('missing google_calendar_client', { kind: 'config' });
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: String(refreshToken).trim(),
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const body = await readJson(response);
  if (!response.ok || !body.access_token) {
    const kind =
      response.status === 401 || response.status === 403 || body.error === 'invalid_grant'
        ? 'revoked'
        : 'oauth';
    throw new CalendarOAuthError('google_oauth_refresh_failed', { kind });
  }
  return String(body.access_token);
}

export async function fetchGoogleEmail(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new CalendarOAuthError('google_userinfo_failed', { kind: 'oauth' });
  }
  return String(body.email || '').trim();
}
