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

export function buildAuthLoginHref(
  provider: 'contact' | 'aad',
  redirectPath = '/lessons/book',
): string {
  const safePath = redirectPath.startsWith('/') ? redirectPath : '/lessons/book';
  const encoded = encodeURIComponent(safePath);
  return `/.auth/login/${provider}?post_login_redirect_uri=${encoded}`;
}
