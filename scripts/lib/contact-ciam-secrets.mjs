/**
 * Read CIAM IdP credentials from Azure Key Vault via Azure CLI.
 * Never logs secret values.
 */
import { spawnSync } from 'node:child_process';

export const DEFAULT_SHARED_KV_NAME = 'kv-elyse-shared';

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSecretReady(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed !== '' && trimmed !== 'REPLACE_ME';
}

/**
 * @param {string} vaultName
 * @param {string} secretName
 * @returns {string | null}
 */
export function readKvSecret(vaultName, secretName) {
  const vault = vaultName.trim();
  const name = secretName.trim();
  if (!vault || !name) return null;

  const result = spawnSync(
    'az',
    ['keyvault', 'secret', 'show', '--vault-name', vault, '--name', name, '--query', 'value', '-o', 'tsv'],
    {
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    },
  );
  if (result.status !== 0) {
    return null;
  }
  return String(result.stdout ?? '').replace(/\r?\n$/, '');
}

/**
 * @typedef {{
 *   ready: boolean;
 *   values: Record<string, string>;
 *   missing: string[];
 * }} IdpCredentialBundle
 */

/**
 * Load IdP credentials referenced by manifests. Never logs secret values.
 *
 * @param {Record<string, unknown>[]} idpManifests
 * @param {{ vaultName?: string }} [options]
 * @returns {Map<string, IdpCredentialBundle>}
 */
export function loadIdpCredentials(idpManifests, options = {}) {
  const vault = (options.vaultName || process.env.AZURE_SHARED_KEY_VAULT_NAME || DEFAULT_SHARED_KV_NAME).trim();
  /** @type {Map<string, IdpCredentialBundle>} */
  const map = new Map();

  for (const doc of idpManifests) {
    const key = String(doc.key ?? '').trim();
    const spec = doc.spec;
    if (!key || !spec || typeof spec !== 'object') continue;

    const type = String(/** @type {Record<string, unknown>} */ (spec).type ?? '').trim();
    if (type === 'builtin') {
      map.set(key, { ready: true, values: {}, missing: [] });
      continue;
    }

    const secrets = /** @type {Record<string, unknown>} */ (spec).secrets;
    if (!secrets || typeof secrets !== 'object') {
      map.set(key, { ready: false, values: {}, missing: ['spec.secrets'] });
      continue;
    }

    /** @type {Record<string, string>} */
    const values = {};
    /** @type {string[]} */
    const missing = [];
    for (const [field, secretName] of Object.entries(secrets)) {
      const name = String(secretName).trim();
      const value = readKvSecret(vault, name);
      if (!isSecretReady(value)) {
        missing.push(name);
      } else {
        values[field] = /** @type {string} */ (value);
      }
    }
    map.set(key, { ready: missing.length === 0, values, missing });
  }

  return map;
}
