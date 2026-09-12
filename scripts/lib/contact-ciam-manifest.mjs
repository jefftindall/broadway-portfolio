/**
 * Load and normalize CIAM desired-state manifests from infra/contact-ciam/.
 * ACCOUNT-P1-007 foundation; flow bodies expand in ACCOUNT-P1-008+.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SUPPORTED_ENVIRONMENTS = ['staging', 'prod'];

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * @param {string} repoRoot
 * @returns {string}
 */
export function contactCiamRoot(repoRoot) {
  return path.join(repoRoot, 'infra', 'contact-ciam');
}

/**
 * @param {string} filePath
 * @returns {unknown}
 */
function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * @param {string} repoRoot
 * @param {string} environment
 * @returns {{
 *   environment: string;
 *   repoRoot: string;
 *   flow: Record<string, unknown> | null;
 *   idps: Record<string, unknown>[];
 *   branding: Record<string, unknown> | null;
 *   sourceFiles: string[];
 * }}
 */
export function loadContactCiamManifest(repoRoot, environment) {
  if (!SUPPORTED_ENVIRONMENTS.includes(environment)) {
    throw new Error(`CONTACT_CIAM_ENV must be one of: ${SUPPORTED_ENVIRONMENTS.join(', ')}`);
  }

  const root = contactCiamRoot(repoRoot);
  const sourceFiles = [];
  /** @type {Record<string, unknown> | null} */
  let flow = null;
  /** @type {Record<string, unknown>[]} */
  const idps = [];
  /** @type {Record<string, unknown> | null} */
  let branding = null;

  const flowPath = path.join(root, 'flows', `${environment}.json`);
  if (fs.existsSync(flowPath)) {
    flow = /** @type {Record<string, unknown>} */ (readJsonFile(flowPath));
    sourceFiles.push(flowPath);
    validateSchemaVersion(flow, flowPath);
  }

  const idpDir = path.join(root, 'idps');
  if (fs.existsSync(idpDir)) {
    for (const name of fs.readdirSync(idpDir).sort()) {
      if (!name.endsWith('.json')) continue;
      const idpPath = path.join(idpDir, name);
      const doc = /** @type {Record<string, unknown>} */ (readJsonFile(idpPath));
      validateSchemaVersion(doc, idpPath);
      idps.push(doc);
      sourceFiles.push(idpPath);
    }
  }

  const brandingPath = path.join(root, 'branding', 'theme.json');
  if (fs.existsSync(brandingPath)) {
    branding = /** @type {Record<string, unknown>} */ (readJsonFile(brandingPath));
    sourceFiles.push(brandingPath);
    validateSchemaVersion(branding, brandingPath);
  }

  return {
    environment,
    repoRoot,
    flow,
    idps,
    branding,
    sourceFiles,
  };
}

/**
 * @param {Record<string, unknown>} doc
 * @param {string} filePath
 */
function validateSchemaVersion(doc, filePath) {
  const version = doc.schemaVersion;
  if (version !== 1) {
    throw new Error(`${filePath}: unsupported schemaVersion ${String(version)} (expected 1)`);
  }
}

/**
 * Resolve {{ENV_VAR}} placeholders using process env (never logs values).
 *
 * @param {unknown} value
 * @param {Record<string, string>} env
 * @returns {unknown}
 */
export function resolveManifestPlaceholders(value, env = process.env) {
  if (typeof value === 'string') {
    return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_placeholder, name) => {
      const resolved = env[name];
      if (!isNonEmptyString(resolved)) {
        throw new Error(`Missing env placeholder ${name} for manifest value`);
      }
      return resolved.trim();
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveManifestPlaceholders(item, env));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, resolveManifestPlaceholders(nested, env)]),
    );
  }
  return value;
}

/**
 * @param {ReturnType<typeof loadContactCiamManifest>} manifest
 * @param {Record<string, string>} env
 */
export function resolveContactCiamManifest(manifest, env = process.env) {
  return {
    ...manifest,
    flow: manifest.flow ? /** @type {Record<string, unknown>} */ (resolveManifestPlaceholders(manifest.flow, env)) : null,
    idps: manifest.idps.map((idp) =>
      /** @type {Record<string, unknown>} */ (resolveManifestPlaceholders(idp, env)),
    ),
    branding: manifest.branding
      ? /** @type {Record<string, unknown>} */ (resolveManifestPlaceholders(manifest.branding, env))
      : null,
  };
}

/**
 * Stable JSON for diffing (sorted keys).
 *
 * @param {unknown} value
 * @returns {string}
 */
export function stableJson(value) {
  return `${JSON.stringify(sortDeep(value), null, 0)}\n`;
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function sortDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortDeep(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortDeep(/** @type {Record<string, unknown>} */ (value)[key])]),
    );
  }
  return value;
}

/**
 * @param {string} repoRoot
 * @param {string[]} sourceFiles
 * @returns {string}
 */
export function manifestContentHash(repoRoot, sourceFiles) {
  const hash = crypto.createHash('sha256');
  for (const file of [...sourceFiles].sort()) {
    hash.update(path.relative(repoRoot, file));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}
