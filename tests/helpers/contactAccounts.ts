import type { APIRequestContext } from '@playwright/test';

export type ContactAccountConfig = {
  enabled: boolean;
};

function flagEnabled(value: unknown): boolean {
  return /^(1|true|yes)$/i.test(String(value ?? '').trim());
}

export function parseContactAccountConfig(data: unknown): ContactAccountConfig {
  if (!data || typeof data !== 'object') return { enabled: false };
  const record = data as Record<string, unknown>;
  return { enabled: flagEnabled(record.enabled) };
}

/** Read the deployed CONTACT_ACCOUNTS_ENABLED flag from the public API. */
export async function fetchContactAccountsEnabled(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get('/api/contactAccountConfig', { maxRedirects: 0 });
    if (!res.ok()) return false;
    return parseContactAccountConfig(await res.json()).enabled;
  } catch {
    return false;
  }
}
