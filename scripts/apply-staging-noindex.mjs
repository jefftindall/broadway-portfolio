/**
 * Staging-only crawler lock: overwrite robots.txt and add X-Robots-Tag on the
 * downloaded/built SWA artifact. Production deploys must never run this —
 * CD: main and CD: staging apply it after the shared Astro build, before
 * upload to the staging Static Web App only (SEARCH-P2-008).
 *
 * Usage: node scripts/apply-staging-noindex.mjs [distDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STAGING_ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';
export const STAGING_X_ROBOTS_TAG = 'noindex, nofollow, noarchive';

/**
 * @param {string} distDir
 */
export function applyStagingNoIndex(distDir) {
  const resolved = path.resolve(distDir);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Staging noindex target is not a directory: ${resolved}`);
  }

  fs.writeFileSync(path.join(resolved, 'robots.txt'), STAGING_ROBOTS_TXT, 'utf8');

  const configPath = path.join(resolved, 'staticwebapp.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing ${configPath} (Astro copies public/staticwebapp.config.json into dist/)`);
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  /** @type {Record<string, unknown>} */
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in ${configPath}: ${detail}`);
  }
  const globalHeaders =
    config.globalHeaders && typeof config.globalHeaders === 'object' && !Array.isArray(config.globalHeaders)
      ? { ...config.globalHeaders }
      : {};
  globalHeaders['X-Robots-Tag'] = STAGING_X_ROBOTS_TAG;
  config.globalHeaders = globalHeaders;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const distDir = process.argv[2] || 'dist';
  applyStagingNoIndex(distDir);
  console.log(`Applied staging noindex under ${path.resolve(distDir)} (Disallow: / + X-Robots-Tag).`);
}
