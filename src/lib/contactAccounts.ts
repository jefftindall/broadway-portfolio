/** Public contact-account feature flag. No secrets or PII. */

export type ContactAccountConfig = {
  enabled: boolean;
};

function flagEnabled(value: unknown): boolean {
  return /^(1|true|yes)$/i.test(String(value ?? '').trim());
}

/**
 * Local `astro dev` only. Staging and prod read `GET /api/contactAccountConfig`.
 */
export function bakedContactAccountConfig(): ContactAccountConfig {
  return { enabled: flagEnabled(import.meta.env.PUBLIC_CONTACT_ACCOUNTS_ENABLED) };
}

export function parseContactAccountConfig(data: unknown): ContactAccountConfig {
  if (!data || typeof data !== 'object') return { enabled: false };
  const record = data as Record<string, unknown>;
  return { enabled: flagEnabled(record.enabled) };
}

export const CONTACT_SWA_ROLE = 'contact';

/** External ID custom OIDC provider id (staticwebapp.config.json). */
export const CONTACT_IDENTITY_PROVIDER = 'contact';

export type ContactSocialIdp = 'google' | 'apple' | 'microsoft';

export const CONTACT_SOCIAL_LOGIN_OPTIONS: ReadonlyArray<{
  id: ContactSocialIdp;
  label: string;
  testId: string;
}> = [
  { id: 'google', label: 'Google', testId: 'login-contact-google' },
  { id: 'apple', label: 'Apple', testId: 'login-contact-apple' },
  { id: 'microsoft', label: 'Microsoft', testId: 'login-contact-microsoft' },
];

export type SwaClientPrincipal = {
  userId?: string;
  userDetails?: string;
  identityProvider?: string;
  userRoles?: string[];
};

export type SwaMeResponse = {
  clientPrincipal?: SwaClientPrincipal | null;
};

export function hasContactSession(me: SwaMeResponse | null | undefined): boolean {
  const roles = me?.clientPrincipal?.userRoles;
  return Array.isArray(roles) && roles.includes(CONTACT_SWA_ROLE);
}

export type AuthLoginProvider = 'contact' | 'aad';

export function buildAuthLoginHref(provider: AuthLoginProvider, redirectPath = '/lessons/book'): string {
  const safePath = redirectPath.startsWith('/') ? redirectPath : '/lessons/book';
  const params = new URLSearchParams({ post_login_redirect_uri: safePath });
  return `/.auth/login/${provider}?${params.toString()}`;
}

/** Student/parent External ID login — shows CIAM IdP picker. */
export function buildContactAuthLoginHref(redirectPath = '/lessons/book'): string {
  return buildAuthLoginHref('contact', redirectPath);
}

/**
 * Social shortcut buttons use the same CIAM picker flow as buildContactAuthLoginHref.
 * Entra External ID rejects domain_hint=google|apple on desktop browsers (AADSTS90023).
 */
export function buildContactSocialLoginHref(
  _idp: ContactSocialIdp,
  redirectPath = '/lessons/book',
): string {
  return buildContactAuthLoginHref(redirectPath);
}
