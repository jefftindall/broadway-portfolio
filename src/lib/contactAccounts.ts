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

/** CIAM domain_hint values (Entra External ID social direct sign-in). */
export const CONTACT_SOCIAL_IDP_HINTS = {
  google: 'google',
  apple: 'apple',
  microsoft: 'live.com',
} as const;

export type ContactSocialIdp = keyof typeof CONTACT_SOCIAL_IDP_HINTS;

export const CONTACT_SOCIAL_LOGIN_OPTIONS: ReadonlyArray<{
  id: ContactSocialIdp;
  label: string;
  domainHint: string;
  testId: string;
}> = [
  { id: 'google', label: 'Google', domainHint: CONTACT_SOCIAL_IDP_HINTS.google, testId: 'login-contact-google' },
  { id: 'apple', label: 'Apple', domainHint: CONTACT_SOCIAL_IDP_HINTS.apple, testId: 'login-contact-apple' },
  {
    id: 'microsoft',
    label: 'Microsoft',
    domainHint: CONTACT_SOCIAL_IDP_HINTS.microsoft,
    testId: 'login-contact-microsoft',
  },
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

export type AuthLoginHrefOptions = {
  /** CIAM social direct sign-in (contact provider only). */
  domainHint?: string;
};

export function buildAuthLoginHref(
  provider: AuthLoginProvider,
  redirectPath = '/lessons/book',
  options: AuthLoginHrefOptions = {},
): string {
  const safePath = redirectPath.startsWith('/') ? redirectPath : '/lessons/book';
  const params = new URLSearchParams({ post_login_redirect_uri: safePath });
  if (provider === 'contact' && options.domainHint) {
    params.set('domain_hint', options.domainHint);
  }
  return `/.auth/login/${provider}?${params.toString()}`;
}

/** Student/parent External ID login with optional social domain_hint (ACCOUNT-P1-013). */
export function buildContactAuthLoginHref(
  redirectPath = '/lessons/book',
  options: AuthLoginHrefOptions = {},
): string {
  return buildAuthLoginHref('contact', redirectPath, options);
}

export function buildContactSocialLoginHref(
  idp: ContactSocialIdp,
  redirectPath = '/lessons/book',
): string {
  return buildContactAuthLoginHref(redirectPath, { domainHint: CONTACT_SOCIAL_IDP_HINTS[idp] });
}
