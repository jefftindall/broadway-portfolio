import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/** Public image trees Studio may upload into or gallery entries may reference. */
const IMAGE_ROOTS = ['public/images/gallery', 'public/images/photos'] as const;

/**
 * Map SHA-256 hex → public URL path (e.g. `/images/gallery/headshot.jpg`).
 * Skips `instagram/` dump folders. First path wins on rare hash collisions.
 */
export function buildPublicImageHashIndex(
  cwd: string = process.cwd(),
): Record<string, string> {
  const index: Record<string, string> = {};

  for (const rootRel of IMAGE_ROOTS) {
    const absRoot = path.join(cwd, rootRel);
    if (!fs.existsSync(absRoot)) continue;
    walk(absRoot, rootRel, index, cwd);
  }

  return index;
}

function walk(
  absDir: string,
  rootRel: string,
  index: Record<string, string>,
  cwd: string,
) {
  for (const ent of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    if (ent.name === 'instagram') continue;
    const abs = path.join(absDir, ent.name);
    if (ent.isDirectory()) {
      walk(abs, rootRel, index, cwd);
      continue;
    }
    if (!IMAGE_EXT.test(ent.name)) continue;
    const buf = fs.readFileSync(abs);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (index[hash]) continue;
    const relFromPublic = path.relative(path.join(cwd, 'public'), abs).split(path.sep).join('/');
    index[hash] = `/${relFromPublic}`;
  }
}
