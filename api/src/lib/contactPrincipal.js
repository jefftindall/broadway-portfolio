/**
 * Parse SWA contact principals — no PII in logs from this module.
 */
import { CONTACT_IDENTITY_PROVIDER } from './authRoles.js';

const EMAIL_CLAIM_TYPES = new Set([
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  'emails',
  'email',
]);

const NAME_CLAIM_TYPES = new Set([
  'name',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
]);

const LEGACY_CONTACT_PROVIDERS = new Set(['contact-google', 'contact-apple', 'contact-microsoft']);

function claimValues(principal, typ) {
  const claims = Array.isArray(principal?.claims) ? principal.claims : [];
  return claims
    .filter((claim) => String(claim?.typ || '') === typ)
    .map((claim) => String(claim?.val || '').trim())
    .filter(Boolean);
}

function firstClaim(principal, types) {
  for (const typ of types) {
    const values = claimValues(principal, typ);
    if (values.length > 0) return values[0];
  }
  return '';
}

function looksLikeEmail(value) {
  const text = String(value || '').trim();
  return Boolean(text) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

export function isContactIdentityProvider(provider) {
  const id = String(provider || '').trim().toLowerCase();
  return id === CONTACT_IDENTITY_PROVIDER || LEGACY_CONTACT_PROVIDERS.has(id);
}

export function isContactPrincipal(principal) {
  return isContactIdentityProvider(principal?.identityProvider);
}

/**
 * @param {object | null | undefined} principal
 * @returns {{ provider: string, issuer: string, subject: string }}
 */
export function contactIdentityKeyFromPrincipal(principal) {
  const provider = String(principal?.identityProvider || '').trim().toLowerCase();
  const subject = String(principal?.userId || '').trim();
  const issuer = firstClaim(principal, ['iss', 'issuer']);
  return { provider, issuer, subject };
}

export function contactEmailFromPrincipal(principal) {
  const fromClaims = firstClaim(principal, EMAIL_CLAIM_TYPES);
  if (fromClaims) return fromClaims;
  const details = String(principal?.userDetails || '').trim();
  return looksLikeEmail(details) ? details : '';
}

export function contactDisplayNameFromPrincipal(principal) {
  const fromClaims = firstClaim(principal, NAME_CLAIM_TYPES);
  if (fromClaims) return fromClaims.slice(0, 200);
  const email = contactEmailFromPrincipal(principal);
  if (email) {
    const local = email.split('@')[0] || '';
    if (local) return local.slice(0, 200);
  }
  return 'Student';
}

export function isAppleRelayEmail(email) {
  return /@privaterelay\.appleid\.com$/i.test(String(email || '').trim());
}
