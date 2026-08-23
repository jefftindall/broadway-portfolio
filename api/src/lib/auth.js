/**
 * Studio identity helpers.
 *
 * Authentication (Entra + SWA Easy Auth) is not authorization.
 * A signed-in `x-ms-client-principal` only proves who called. Every privileged
 * route must decide what that identity may do:
 * - Publish / upload / discrete site values: ALLOWED_USER_IDS allowlist
 * - People / CRM: signed-in + owner-scoped partition (`studioOwnerKey`)
 *
 * Do not treat SWA `authenticated` as permission to act. Do not use Entra
 * "Assignment required" to stand in for these checks (that blocks login with
 * AADSTS50105 and still would not authorize the caller).
 *
 * Local Functions (`AZURE_FUNCTIONS_ENVIRONMENT=Development`) skip the
 * allowlist so `func start` works without SWA headers.
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

/** Publish allowlist only — a valid principal is not enough. */
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

/**
 * Gate for publish-capable routes. Call this even when SWA already required
 * `authenticated` — a signed-in user is not a publisher by default.
 */
export function publisherGate(request) {
  const principal = getClientPrincipal(request);
  if (isDevelopmentEnvironment()) {
    return { allowed: true, principal, reason: 'development' };
  }
  if (!isAuthorizedPublisher(principal)) {
    return {
      allowed: false,
      principal,
      correlationId: newCorrelationId(),
    };
  }
  return { allowed: true, principal };
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

export function isDevelopmentEnvironment() {
  return process.env.AZURE_FUNCTIONS_ENVIRONMENT === 'Development';
}

/** Any signed-in Studio user — not the publish allowlist. */
export function isSignedInStudioUser(principal) {
  if (isDevelopmentEnvironment()) return true;
  return Boolean(principal?.userId || principal?.userDetails);
}

/** Table Storage partition for this signed-in user. */
export function studioOwnerKey(principal) {
  if (isDevelopmentEnvironment()) {
    return String(process.env.STUDIO_CRM_DEV_OWNER || 'dev').trim() || 'dev';
  }
  const userId = String(principal?.userId || '').trim();
  if (!userId) {
    const err = new Error('missing studio owner');
    err.name = 'CrmUnauthorizedError';
    throw err;
  }
  return userId;
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
