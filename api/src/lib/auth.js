/**
 * Parse SWA client principal from x-ms-client-principal header.
 * Enforce allowlist from ALLOWED_USER_IDS (comma-separated user IDs or emails).
 */
import { randomUUID } from 'node:crypto';

export function getClientPrincipal(request) {
  const header = request.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function publisherIdentity(principal) {
  if (!principal) {
    return { userId: '', userDetails: '', identityProvider: '' };
  }
  return {
    userId: String(principal.userId || ''),
    userDetails: String(principal.userDetails || ''),
    identityProvider: String(principal.identityProvider || ''),
  };
}

export function newCorrelationId() {
  return randomUUID();
}

export function isAuthorizedPublisher(principal) {
  if (!principal) return false;
  const allow = (process.env.ALLOWED_USER_IDS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return false;

  const userId = String(principal.userId || '').toLowerCase();
  const claims = Array.isArray(principal.claims) ? principal.claims : [];
  const emails = claims
    .filter((c) => c.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress' || c.typ === 'emails' || c.typ === 'email')
    .map((c) => String(c.val || '').toLowerCase());
  const identityProvider = String(principal.identityProvider || '').toLowerCase();
  const userDetails = String(principal.userDetails || '').toLowerCase();

  const candidates = [userId, userDetails, ...emails, `${identityProvider}:${userId}`];
  return candidates.some((c) => c && allow.includes(c));
}

export function unauthorized(correlationId) {
  return {
    status: 401,
    jsonBody: {
      error: 'This account is signed in but cannot publish updates.',
      correlationId: correlationId || undefined,
    },
  };
}
