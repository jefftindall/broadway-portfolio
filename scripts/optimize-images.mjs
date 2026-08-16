#!/usr/bin/env node
/**
 * Incremental WebP variants for referenced public images.
 * Never overwrites originals. Cache key: sha256(raw) + recipeVersion + width + format.
 * Does not walk `_derived/` or hash derivatives.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

export const RECIPE_VERSION = 1;
export const WEBP_QUALITY = 78;

export const ROLE_WIDTHS = {
  hero: [800, 1600],
  banner: [800, 1600],
  poster: [800, 1600],
  show: [420, 840],
  gallery: [480, 960],
  news: [800, 1600],
};

export const HARDCODED_REFS = [
  { sourcePath: '/images/photos/elyse-portrait.jpg', role: 'hero' },
  { sourcePath: '/images/lessons/lessons-banner.jpg', role: 'banner' },
  { sourcePath: '/images/photos/reel-poster.jpg', role: 'poster' },
];

const CONTENT_ROLES = [
  { relDir: 'src/content/shows', role: 'show' },
  { relDir: 'src/content/gallery', role: 'gallery' },
  { relDir: 'src/content/news', role: 'news' },
];

const IMAGE_LINE = /^image:\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/m;

/**
 * @param {string} raw
 * @returns {string | undefined}
 */
export function parseFrontmatterImage(raw) {
  const match = String(raw || '').match(IMAGE_LINE);
  if (!match) return undefined;
  const value = (match[1] || match[2] || match[3] || '').trim();
  return isOptimizablePublicPath(value) ? value : undefined;
}

/**
 * @param {string} sourcePath
 */
export function isOptimizablePublicPath(sourcePath) {
  const p = String(sourcePath || '').replaceAll('\\', '/');
  if (!p.startsWith('/images/')) return false;
  if (p.includes('/_derived/')) return false;
  if (p.includes('/instagram/')) return false;
  return /\.(jpe?g|png|webp)$/i.test(p);
}

/**
 * @param {Iterable<string>} roles
 * @returns {number[]}
 */
export function widthsForRoles(roles) {
  const widths = new Set();
  for (const role of roles) {
    const list = ROLE_WIDTHS[role];
    if (!list) continue;
    for (const w of list) widths.add(w);
  }
  return [...widths].sort((a, b) => a - b);
}

/**
 * Skip encode when the derivative already exists for this raw SHA + recipe + width.
 * @param {{ destAbs: string, sourceSha256: string, recipeVersion: number, existingEntry?: { sourceSha256?: string, recipeVersion?: number, outputs?: Array<{ width: number, format?: string }> } }} opts
 */
export function outputIsFresh(opts) {
  const { destAbs, sourceSha256, recipeVersion, existingEntry } = opts;
  if (!fs.existsSync(destAbs)) return false;
  if (!existingEntry) return false;
  if (existingEntry.sourceSha256 !== sourceSha256) return false;
  if (existingEntry.recipeVersion !== recipeVersion) return false;
  return (existingEntry.outputs || []).some(
    (out) => out.width === Number(path.basename(destAbs, '.webp')) && out.format === 'webp',
  );
}

/**
 * @param {string} root
 * @returns {Map<string, Set<string>>}
 */
export function collectReferencedImages(root) {
  /** @type {Map<string, Set<string>>} */
  const byPath = new Map();

  const add = (sourcePath, role) => {
    if (!isOptimizablePublicPath(sourcePath)) return;
    let roles = byPath.get(sourcePath);
    if (!roles) {
      roles = new Set();
      byPath.set(sourcePath, roles);
    }
    roles.add(role);
  };

  for (const ref of HARDCODED_REFS) add(ref.sourcePath, ref.role);

  for (const { relDir, role } of CONTENT_ROLES) {
    const absDir = path.join(root, relDir);
    if (!fs.existsSync(absDir)) continue;
    for (const name of fs.readdirSync(absDir)) {
      if (!name.endsWith('.md')) continue;
      const raw = fs.readFileSync(path.join(absDir, name), 'utf8');
      const image = parseFrontmatterImage(raw);
      if (image) add(image, role);
    }
  }

  return byPath;
}

function publicToAbs(root, publicPath) {
  return path.join(root, 'public', publicPath.replace(/^\//, '').replaceAll('/', path.sep));
}

function loadManifest(manifestAbs) {
  if (!fs.existsSync(manifestAbs)) {
    return { recipeVersion: RECIPE_VERSION, entries: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestAbs, 'utf8'));
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    return { recipeVersion: Number(parsed.recipeVersion) || 0, entries };
  } catch {
    return { recipeVersion: 0, entries: [] };
  }
}

async function main() {
  const root = process.cwd();
  const outRoot = path.join(root, 'public', 'images', '_derived');
  const manifestAbs = path.join(outRoot, 'manifest.json');
  const previous = loadManifest(manifestAbs);
  const previousBySource = new Map(previous.entries.map((entry) => [entry.sourcePath, entry]));

  const refs = collectReferencedImages(root);
  const entries = [];
  let encoded = 0;
  let skipped = 0;
  let missing = 0;

  for (const [sourcePath, roles] of [...refs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const abs = publicToAbs(root, sourcePath);
    if (!fs.existsSync(abs)) {
      console.warn(`optimize-images: missing original ${sourcePath}`);
      missing += 1;
      continue;
    }

    const buf = fs.readFileSync(abs);
    const sourceSha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const widths = widthsForRoles(roles);
    const existing = previousBySource.get(sourcePath);
    const destDir = path.join(outRoot, sourceSha256);
    fs.mkdirSync(destDir, { recursive: true });

    const outputs = [];
    for (const width of widths) {
      const filename = `${width}.webp`;
      const destAbs = path.join(destDir, filename);
      if (
        outputIsFresh({
          destAbs,
          sourceSha256,
          recipeVersion: RECIPE_VERSION,
          existingEntry: existing,
        })
      ) {
        skipped += 1;
      } else {
        await sharp(buf)
          .rotate()
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toFile(destAbs);
        encoded += 1;
      }
      outputs.push({
        width,
        path: `/images/_derived/${sourceSha256}/${filename}`,
        format: 'webp',
      });
    }

    entries.push({
      sourcePath,
      sourceSha256,
      recipeVersion: RECIPE_VERSION,
      outputs,
    });
  }

  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(
    manifestAbs,
    `${JSON.stringify({ recipeVersion: RECIPE_VERSION, entries }, null, 2)}\n`,
  );

  console.log(
    `optimize-images: ${entries.length} originals, ${encoded} encoded, ${skipped} cached, ${missing} missing`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
