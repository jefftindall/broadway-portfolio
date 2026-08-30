/**
 * Honor CONTACT_ACCOUNTS_ENABLED on the SWA artifact before upload.
 * When disabled, strip the contact custom OIDC provider so missing CONTACT_OIDC_*
 * app settings do not break all /.auth/* routes (including workforce AAD).
 *
 * Usage:
 *   node scripts/patch-contact-auth-config.mjs dist --enabled=false
 *   node scripts/patch-contact-auth-config.mjs dist --enabled=true
 *   node scripts/patch-contact-auth-config.mjs dist --from-swa
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function flagEnabled(value) {
  return /^(1|true|yes)$/i.test(String(value ?? '').trim());
}

/**
 * @param {string} appName
 * @param {string} resourceGroup
 * @returns {boolean}
 */
export function fetchContactAccountsEnabledFromSwa(appName, resourceGroup) {
  const name = String(appName ?? '').trim();
  const group = String(resourceGroup ?? '').trim();
  if (!name || !group) {
    throw new Error('AZURE_STATIC_WEB_APP_NAME and AZURE_RESOURCE_GROUP are required for --from-swa');
  }
  const result = spawnSync(
    'az',
    [
      'staticwebapp',
      'appsettings',
      'list',
      '--name',
      name,
      '--resource-group',
      group,
      '--query',
      'properties.CONTACT_ACCOUNTS_ENABLED',
      '-o',
      'tsv',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(`Failed to read CONTACT_ACCOUNTS_ENABLED from ${name}: ${err}`);
  }
  return flagEnabled(result.stdout);
}

/**
 * @param {string} configPath
 * @param {{ contactAccountsEnabled: boolean }} options
 * @returns {{ contactAccountsEnabled: boolean; removedContactProvider: boolean }}
 */
export function patchContactAuthConfigFile(configPath, { contactAccountsEnabled }) {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  /** @type {Record<string, unknown>} */
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in ${resolved}: ${detail}`);
  }

  let removedContactProvider = false;
  if (!contactAccountsEnabled) {
    const auth = config.auth && typeof config.auth === 'object' ? config.auth : {};
    const providers =
      auth.identityProviders && typeof auth.identityProviders === 'object'
        ? auth.identityProviders
        : {};
    const custom =
      providers.customOpenIdConnectProviders &&
      typeof providers.customOpenIdConnectProviders === 'object'
        ? providers.customOpenIdConnectProviders
        : null;
    if (custom && 'contact' in custom) {
      delete custom.contact;
      removedContactProvider = true;
      if (Object.keys(custom).length === 0) {
        delete providers.customOpenIdConnectProviders;
      } else {
        providers.customOpenIdConnectProviders = custom;
      }
      auth.identityProviders = providers;
      config.auth = auth;
    }
  }

  fs.writeFileSync(resolved, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return { contactAccountsEnabled, removedContactProvider };
}

/**
 * @param {string} distDir
 * @param {{ contactAccountsEnabled: boolean }} options
 */
export function patchContactAuthConfig(distDir, options) {
  const resolved = path.resolve(distDir);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Dist directory not found: ${resolved}`);
  }
  const configPath = path.join(resolved, 'staticwebapp.config.json');
  return patchContactAuthConfigFile(configPath, options);
}

/**
 * @param {string[]} argv
 * @returns {{ distDir: string; contactAccountsEnabled: boolean }}
 */
export function parsePatchContactAuthCli(argv) {
  const distDir = argv[0] || 'dist';
  let contactAccountsEnabled;
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--from-swa') {
      contactAccountsEnabled = fetchContactAccountsEnabledFromSwa(
        process.env.AZURE_STATIC_WEB_APP_NAME,
        process.env.AZURE_RESOURCE_GROUP,
      );
      continue;
    }
    if (arg.startsWith('--enabled=')) {
      contactAccountsEnabled = flagEnabled(arg.slice('--enabled='.length));
    }
  }
  if (contactAccountsEnabled === undefined) {
    throw new Error('Pass --enabled=true|false or --from-swa');
  }
  return { distDir, contactAccountsEnabled };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const { distDir, contactAccountsEnabled } = parsePatchContactAuthCli(process.argv.slice(2));
    const result = patchContactAuthConfig(distDir, { contactAccountsEnabled });
    if (result.contactAccountsEnabled) {
      console.log(`Contact accounts enabled — kept contact OIDC provider in ${path.resolve(distDir)}.`);
    } else if (result.removedContactProvider) {
      console.log(
        `Contact accounts disabled — removed contact OIDC provider from ${path.resolve(distDir)}.`,
      );
    } else {
      console.log(`Contact accounts disabled — no contact OIDC provider present in ${path.resolve(distDir)}.`);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}
