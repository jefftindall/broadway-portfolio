/**
 * Contact session gate — ownership, not the Studio permission catalog (ACCOUNT-P2-002).
 */
import {
  forbidden,
  getClientPrincipal,
  newCorrelationId,
  signInRequired,
} from './auth.js';
import { CONTACT_SWA_ROLE } from './authRoles.js';
import { contactAccountsEnabledFromEnv } from './contactAccountConfig.js';
import { isContactPrincipal } from './contactPrincipal.js';

function principalRoles(principal) {
  const roles = principal?.userRoles;
  return Array.isArray(roles) ? roles.map((role) => String(role || '').trim()) : [];
}

function isDevEnv(env = process.env) {
  return env.AZURE_FUNCTIONS_ENVIRONMENT === 'Development';
}

function devContactPrincipalFromEnv(env = process.env) {
  const raw = String(env.CONTACT_DEV_PRINCIPAL || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function resolveContactPrincipal(request, env = process.env) {
  const headerPrincipal = getClientPrincipal(request);
  if (headerPrincipal) return headerPrincipal;
  if (!isDevEnv(env)) return null;
  return devContactPrincipalFromEnv(env);
}

/**
 * @returns {Promise<{
 *   allowed: boolean,
 *   signedIn: boolean,
 *   principal: object | null,
 *   correlationId: string,
 *   featureEnabled: boolean,
 * }>}
 */
export async function contactGate(request, opts = {}) {
  const env = opts.env || process.env;
  const correlationId = newCorrelationId();
  const featureEnabled = contactAccountsEnabledFromEnv(env);
  const principal = resolveContactPrincipal(request, env);

  if (!featureEnabled) {
    return { allowed: false, signedIn: Boolean(principal), principal, correlationId, featureEnabled };
  }

  if (!principal?.userId && !principal?.userDetails) {
    return { allowed: false, signedIn: false, principal, correlationId, featureEnabled };
  }

  if (!isContactPrincipal(principal)) {
    return {
      allowed: false,
      signedIn: true,
      principal,
      correlationId,
      featureEnabled,
    };
  }

  const roles = principalRoles(principal);
  if (!isDevEnv(env) && roles.length > 0 && !roles.includes(CONTACT_SWA_ROLE)) {
    return {
      allowed: false,
      signedIn: true,
      principal,
      correlationId,
      featureEnabled,
    };
  }

  return {
    allowed: true,
    signedIn: true,
    principal,
    correlationId,
    featureEnabled,
  };
}

export function contactSignInRequired(correlationId) {
  return signInRequired(correlationId);
}

export function contactBookSignInRequired(correlationId) {
  return {
    status: 401,
    jsonBody: {
      error: 'Sign in to see open times or request a lesson slot.',
      correlationId: correlationId || undefined,
    },
  };
}

export function contactForbidden(correlationId, error) {
  return forbidden(
    correlationId,
    error || 'This account is signed in but cannot manage this profile.',
  );
}

export function contactFeatureDisabled(correlationId) {
  return {
    status: 404,
    jsonBody: {
      error: 'Student accounts are not available right now.',
      correlationId,
    },
  };
}
