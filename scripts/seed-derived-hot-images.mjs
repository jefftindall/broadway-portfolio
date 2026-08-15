#!/usr/bin/env node
/**
 * Phase A — seed WebP variants for the three live-trace offenders.
 * Does not overwrite originals. Phase B replaces this with incremental optimize-images.mjs.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const RECIPE_VERSION = 1;
const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, 'public', 'images', '_derived');

const JOBS = [
  { sourcePath: '/images/shows/Ursula.jpg', widths: [420, 840] },
  { sourcePath: '/images/lessons/lessons-banner.jpg', widths: [800, 1600] },
  { sourcePath: '/images/photos/elyse-portrait.jpg', widths: [800, 1600] },
];

function publicToAbs(publicPath) {
  return path.join(ROOT, 'public', publicPath.replace(/^\//, '').replaceAll('/', path.sep));
}

const entries = [];

for (const job of JOBS) {
  const abs = publicToAbs(job.sourcePath);
  const buf = fs.readFileSync(abs);
  const sourceSha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const dir = path.join(OUT_ROOT, sourceSha256);
  fs.mkdirSync(dir, { recursive: true });

  const outputs = [];
  for (const width of job.widths) {
    const filename = `${width}.webp`;
    const dest = path.join(dir, filename);
    await sharp(buf)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(dest);
    outputs.push({
      width,
      path: `/images/_derived/${sourceSha256}/${filename}`,
      format: 'webp',
    });
  }

  entries.push({
    sourcePath: job.sourcePath,
    sourceSha256,
    recipeVersion: RECIPE_VERSION,
    outputs,
  });
}

fs.writeFileSync(
  path.join(OUT_ROOT, 'manifest.json'),
  `${JSON.stringify({ recipeVersion: RECIPE_VERSION, entries }, null, 2)}\n`,
);

console.log(`Seeded ${entries.length} originals → ${OUT_ROOT}`);
