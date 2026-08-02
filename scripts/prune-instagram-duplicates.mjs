import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const igDir = 'public/images/gallery/instagram';
const manifestPath = path.join(igDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function hashFile(p) {
  return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
}

const allFiles = fs.readdirSync(igDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
console.log('On disk:', allFiles.length);

const byHash = new Map();
for (const item of manifest.items) {
  const fp = path.join(igDir, item.file);
  if (!fs.existsSync(fp)) continue;
  const h = item.contentHash || hashFile(fp);
  if (!byHash.has(h)) byHash.set(h, []);
  byHash.get(h).push(item);
}

for (const f of allFiles) {
  if (manifest.items.some((i) => i.file === f)) continue;
  const h = hashFile(path.join(igDir, f));
  if (!byHash.has(h)) byHash.set(h, []);
  byHash.get(h).push({ file: f, usable: false, duplicateOf: null, contentHash: h });
}

const uniqueUsable = new Set(manifest.uniqueUsableFiles || []);
const keep = new Set();

for (const [, items] of byHash) {
  const sorted = items
    .slice()
    .sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true }));
  const preferred =
    sorted.find((i) => uniqueUsable.has(i.file)) ||
    sorted.find((i) => i.usable && !i.duplicateOf) ||
    sorted.find((i) => !i.duplicateOf) ||
    sorted[0];

  const isChrome = preferred.assetKind === 'chrome' || preferred.usable === false;
  if (uniqueUsable.has(preferred.file) || (preferred.usable && !isChrome)) {
    keep.add(preferred.file);
  }
}

for (const f of uniqueUsable) {
  if (fs.existsSync(path.join(igDir, f))) keep.add(f);
}

const toDelete = allFiles.filter((f) => !keep.has(f));
console.log('Keep:', keep.size, 'Delete:', toDelete.length);

for (const f of toDelete) {
  fs.unlinkSync(path.join(igDir, f));
}

const keptItems = manifest.items
  .filter((i) => keep.has(i.file))
  .map((i) => ({ ...i, duplicateOf: null }))
  .sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true }));

const newManifest = {
  ...manifest,
  prunedAt: new Date().toISOString(),
  enrichmentNotes: [
    ...(manifest.enrichmentNotes || []),
    'Pruned content-hash duplicates and unreferenced chrome/UI downloads; one file kept per unique photo.',
  ],
  stats: {
    totalItems: keptItems.length,
    uniqueHashes: keptItems.length,
    usableItems: keptItems.filter((i) => i.usable).length,
    uniqueUsable: keptItems.filter((i) => i.usable).length,
    chromeItems: keptItems.filter((i) => !i.usable).length,
  },
  uniqueUsableFiles: keptItems
    .filter((i) => i.usable)
    .map((i) => i.file)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  items: keptItems,
};

fs.writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2) + '\n');
console.log('Deleted', toDelete.length, 'files. Manifest now', keptItems.length, 'items.');
console.log(
  'Remaining:',
  [...keep].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', '),
);
