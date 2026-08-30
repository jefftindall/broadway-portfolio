/**
 * Fetch CONTACT-CIAM-OIDC-ISSUER from Key Vault and patch staticwebapp.config.json
 * targets (dist/ for CD, or repo copies for local dev).
 *
 * Usage:
 *   node scripts/sync-contact-oidc-issuer.mjs dist
 *   node scripts/sync-contact-oidc-issuer.mjs repo
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  patchContactOidcIssuer,
  resolveCanonicalContactOidcIssuer,
} from './patch-contact-oidc-issuer.mjs';

const SHARED_VAULT = process.env.AZURE_SHARED_KEY_VAULT_NAME || 'kv-elyse-shared';

/**
 * @returns {string}
 */
export function fetchContactOidcIssuerFromVault() {
  const result = spawnSync(
    'az',
    [
      'keyvault',
      'secret',
      'show',
      '--vault-name',
      SHARED_VAULT,
      '--name',
      'CONTACT-CIAM-OIDC-ISSUER',
      '--query',
      'value',
      '-o',
      'tsv',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(`Failed to read CONTACT-CIAM-OIDC-ISSUER from ${SHARED_VAULT}: ${err}`);
  }
  return String(result.stdout || '').trim();
}

/**
 * @param {string} issuer
 * @returns {boolean}
 */
export function isContactOidcIssuerReady(issuer) {
  const trimmed = String(issuer ?? '').trim();
  return trimmed !== '' && trimmed !== 'REPLACE_ME';
}

/**
 * @param {'dist' | 'repo'} mode
 * @returns {Promise<{ synced: boolean; issuer: string; canonicalIssuer?: string }>}
 */
export async function syncContactOidcIssuer(mode) {
  const issuer = fetchContactOidcIssuerFromVault();
  if (!isContactOidcIssuerReady(issuer)) {
    return { synced: false, issuer };
  }
  const canonicalIssuer = await resolveCanonicalContactOidcIssuer(issuer);
  if (mode === 'dist') {
    patchContactOidcIssuer('dist', canonicalIssuer);
    return { synced: true, issuer, canonicalIssuer };
  }
  if (mode === 'repo') {
    patchContactOidcIssuer('public/staticwebapp.config.json', canonicalIssuer);
    patchContactOidcIssuer('staticwebapp.config.json', canonicalIssuer);
    return { synced: true, issuer, canonicalIssuer };
  }
  throw new Error('mode must be "dist" or "repo"');
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const mode = process.argv[2] || 'dist';
  syncContactOidcIssuer(mode === 'repo' ? 'repo' : 'dist')
    .then(({ synced, issuer, canonicalIssuer }) => {
      if (synced) {
        if (canonicalIssuer && canonicalIssuer !== issuer) {
          console.log(`Resolved canonical CIAM issuer from OIDC discovery.`);
        }
        console.log(`Synced contact OIDC issuer to ${mode}.`);
      } else {
        console.log(
          `Skipped contact OIDC issuer sync (${issuer || 'empty'}); bootstrap CIAM not ready yet.`,
        );
      }
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    });
}
