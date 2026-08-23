/**
 * Studio identity helpers.
 *
 * Authentication (Entra + SWA Easy Auth) is not authorization.
 * A signed-in `x-ms-client-principal` only proves who called. Every privileged
 * route must decide what that identity may do via `permissionGate` /
 * `publisherGate` in `studioAccess.js` (roles + discrete permissions).
 *
 * Do not treat SWA `authenticated` as permission to act. Do not use Entra
 * "Assignment required" to stand in for these checks (that blocks login with
 * AADSTS50105 and still would not authorize the caller).
 *
 * Local Functions (`AZURE_FUNCTIONS_ENVIRONMENT=Development`) grant the
 * catalog so `func start` works without SWA headers.
 */
import { randomUUID } from 'node:crypto';

const EMAIL_CLAIM_TYPES = new Set([
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  'emails',
  'email',
]);

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

/** Normalized identity keys used to match allowlists and user profiles. */
export function identityCandidates(principal) {
  if (!principal) return [];
  const userId = String(principal.userId || '').toLowerCase();
  const claims = Array.isArray(principal.claims) ? principal.claims : [];
  const emails = claims
    .filter((c) => EMAIL_CLAIM_TYPES.has(c.typ))
    .map((c) => String(c.val || '').toLowerCase());
  const identityProvider = String(principal.identityProvider || '').toLowerCase();
  const userDetails = String(principal.userDetails || '').toLowerCase();
  const seen = new Set();
  const out = [];
  for (const value of [userId, userDetails, ...emails, `${identityProvider}:${userId}`]) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function parseAllowlist(env = process.env) {
  return String(env.ALLOWED_USER_IDS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Bootstrap allowlist match only. Not a live publish gate — profiles are SoT. */
export function isAuthorizedPublisher(principal, env = process.env) {
  if (!principal) return false;
  const allow = parseAllowlist(env);
  if (allow.length === 0) return false;
  return identityCandidates(principal).some((c) => allow.includes(c));
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

export function forbidden(correlationId, error) {
  return {
    status: 403,
    jsonBody: {
      error: error || 'This account is signed in but cannot do that.',
      correlationId: correlationId || undefined,
    },
  };
}

export function isDevelopmentEnvironment() {
  return process.env.AZURE_FUNCTIONS_ENVIRONMENT === 'Development';
}

/** Any signed-in Studio user — not the publish allowlist. */
export function isSignedInStudioUser(principal) {
  if (isDevelopmentEnvironment()) return true;
  return Boolean(principal?.userId || principal?.userDetails);
}

export function signInRequired(correlationId) {
  return {
    status: 401,
    jsonBody: {
      error: 'Sign in to use Studio.',
      correlationId: correlationId || undefined,
    },
  };
}
