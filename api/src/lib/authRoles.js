/**
 * SWA rolesSource assignment (ACCOUNT-P1-002).
 * Maps identity provider to SWA roles — not the Studio permission catalog.
 */

/** Workforce Entra (SWA azureActiveDirectory provider id). */
export const STUDIO_IDENTITY_PROVIDER = 'aad';

/** External ID custom OIDC provider id (staticwebapp.config.json). */
export const CONTACT_IDENTITY_PROVIDER = 'contact';

export const STUDIO_SWA_ROLE = 'studio';
export const CONTACT_SWA_ROLE = 'contact';

/**
 * @param {{ identityProvider?: unknown }} [principal]
 * @returns {string[]}
 */
export function assignSwRoles(principal) {
  const provider = String(principal?.identityProvider ?? '').trim().toLowerCase();
  if (provider === STUDIO_IDENTITY_PROVIDER) return [STUDIO_SWA_ROLE];
  if (provider === CONTACT_IDENTITY_PROVIDER) return [CONTACT_SWA_ROLE];
  return [];
}

/**
 * Log-safe provider kind for diagnostics (no emails or tokens).
 * @param {{ identityProvider?: unknown }} [principal]
 */
export function providerKindForLog(principal) {
  const provider = String(principal?.identityProvider ?? '').trim().toLowerCase();
  if (provider === STUDIO_IDENTITY_PROVIDER) return 'workforce_aad';
  if (provider === CONTACT_IDENTITY_PROVIDER) return 'external_id_contact';
  if (!provider) return 'unknown';
  return 'other';
}
