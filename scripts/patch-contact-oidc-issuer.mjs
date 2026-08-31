/**
 * Patch SWA staticwebapp.config.json with the live CIAM OpenID issuer from Key Vault.
 * Committed configs keep a REPLACE_ME placeholder; CD patches dist/ before upload.
 *
 * Usage:
 *   node scripts/patch-contact-oidc-issuer.mjs dist
 *   node scripts/patch-contact-oidc-issuer.mjs public/staticwebapp.config.json https://....ciamlogin.com/.../v2.0
 *   CONTACT_OIDC_ISSUER=https://... node scripts/patch-contact-oidc-issuer.mjs dist
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @param {string} issuer
 */
export function normalizeContactOidcIssuer(issuer) {
  const trimmed = String(issuer ?? '').trim();
  if (!trimmed || trimmed === 'REPLACE_ME') {
    throw new Error('CONTACT_OIDC_ISSUER is missing or REPLACE_ME');
  }
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('CONTACT_OIDC_ISSUER must be a valid https URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('CONTACT_OIDC_ISSUER must use https');
  }
  if (!url.pathname.endsWith('/v2.0')) {
    throw new Error('CONTACT_OIDC_ISSUER must end with /v2.0');
  }
  if (!/\.ciamlogin\.com$/i.test(url.hostname)) {
    throw new Error('CONTACT_OIDC_ISSUER hostname must be *.ciamlogin.com');
  }
  return url.toString();
}

/**
 * Resolve the canonical issuer from CIAM OIDC discovery. Metadata may be fetched
 * using either {prefix}.ciamlogin.com/{tenant-id}/v2.0 or {tenant-id}.ciamlogin.com/{tenant-id}/v2.0,
 * but the discovery document's `issuer` always uses the tenant-id hostname.
 *
 * @param {string} issuerOrMetadataUrl
 * @returns {Promise<string>}
 */
export async function resolveCanonicalContactOidcIssuer(issuerOrMetadataUrl) {
  const seed = normalizeContactOidcIssuer(issuerOrMetadataUrl);
  const wellKnownUrl = `${seed}/.well-known/openid-configuration`;
  const response = await fetch(wellKnownUrl, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch CIAM OIDC discovery (${response.status}) from ${wellKnownUrl}`,
    );
  }
  /** @type {{ issuer?: unknown }} */
  const body = await response.json();
  if (typeof body.issuer !== 'string' || body.issuer.trim() === '') {
    throw new Error(`CIAM OIDC discovery at ${wellKnownUrl} did not include issuer`);
  }
  return normalizeContactOidcIssuer(body.issuer);
}

/**
 * @param {string} issuer
 * @returns {string}
 */
export function contactOidcWellKnownConfigurationUrl(issuer) {
  const normalized = normalizeContactOidcIssuer(issuer);
  return `${normalized}/.well-known/openid-configuration`;
}

/**
 * @param {string} configPath
 * @param {string} issuer
 */
export function patchContactOidcIssuerFile(configPath, issuer) {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`);
  }
  const normalized = normalizeContactOidcIssuer(issuer);
  const wellKnownOpenIdConfiguration = contactOidcWellKnownConfigurationUrl(normalized);
  const raw = fs.readFileSync(resolved, 'utf8');
  /** @type {Record<string, unknown>} */
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in ${resolved}: ${detail}`);
  }

  const auth = config.auth && typeof config.auth === 'object' ? config.auth : {};
  const providers =
    auth.identityProviders && typeof auth.identityProviders === 'object'
      ? auth.identityProviders
      : {};
  const custom =
    providers.customOpenIdConnectProviders &&
    typeof providers.customOpenIdConnectProviders === 'object'
      ? providers.customOpenIdConnectProviders
      : {};
  const contact =
    custom.contact && typeof custom.contact === 'object' ? custom.contact : {};
  const registration =
    contact.registration && typeof contact.registration === 'object'
      ? contact.registration
      : {};

  delete registration.openIdIssuer;
  delete registration.clientSecretSettingName;
  registration.clientIdSettingName = 'CONTACT_OIDC_CLIENT_ID';
  registration.clientCredential = {
    clientSecretSettingName: 'CONTACT_OIDC_CLIENT_SECRET',
  };
  registration.openIdConnectConfiguration = {
    wellKnownOpenIdConfiguration,
  };
  contact.registration = registration;
  custom.contact = contact;
  providers.customOpenIdConnectProviders = custom;
  auth.identityProviders = providers;
  config.auth = auth;

  fs.writeFileSync(resolved, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return normalized;
}

/**
 * @param {string} targetPath
 * @param {string} [issuerArg]
 */
export function patchContactOidcIssuer(targetPath, issuerArg) {
  const issuer = issuerArg ?? process.env.CONTACT_OIDC_ISSUER ?? '';
  const resolved = path.resolve(targetPath);
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    return patchContactOidcIssuerFile(path.join(resolved, 'staticwebapp.config.json'), issuer);
  }
  return patchContactOidcIssuerFile(resolved, issuer);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const target = process.argv[2] || 'dist';
  const issuerArg = process.argv[3];
  const patched = patchContactOidcIssuer(target, issuerArg);
  console.log(`Patched contact OIDC issuer in ${path.resolve(target)} (${patched}).`);
}
