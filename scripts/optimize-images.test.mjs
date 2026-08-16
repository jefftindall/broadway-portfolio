import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  HARDCODED_REFS,
  RECIPE_VERSION,
  collectReferencedImages,
  isOptimizablePublicPath,
  outputIsFresh,
  parseFrontmatterImage,
  widthsForRoles,
} from './optimize-images.mjs';

test('parseFrontmatterImage reads quoted and bare public paths', () => {
  assert.equal(
    parseFrontmatterImage('---\nimage: /images/shows/Ursula.jpg\n---\n'),
    '/images/shows/Ursula.jpg',
  );
  assert.equal(
    parseFrontmatterImage('---\nimage: "/images/photos/pending.jpg"\n---\n'),
    '/images/photos/pending.jpg',
  );
  assert.equal(parseFrontmatterImage('---\nimage: /downloads/headshot.jpg\n---\n'), undefined);
  assert.equal(parseFrontmatterImage('---\nimage: /images/_derived/abc/800.webp\n---\n'), undefined);
});

test('isOptimizablePublicPath rejects derived, instagram, and downloads', () => {
  assert.equal(isOptimizablePublicPath('/images/gallery/headshot.jpg'), true);
  assert.equal(isOptimizablePublicPath('/images/_derived/abc/420.webp'), false);
  assert.equal(isOptimizablePublicPath('/images/gallery/instagram/x.jpg'), false);
  assert.equal(isOptimizablePublicPath('/downloads/elyse-tindall-headshot-theatrical.jpg'), false);
});

test('widthsForRoles unions hero and show recipes', () => {
  assert.deepEqual(widthsForRoles(['show']), [420, 840]);
  assert.deepEqual(widthsForRoles(['hero', 'show']), [420, 800, 840, 1600]);
});

test('collectReferencedImages finds content + hardcoded originals', () => {
  const refs = collectReferencedImages(process.cwd());
  assert.ok(refs.get('/images/shows/Ursula.jpg')?.has('show'));
  assert.ok(refs.get('/images/gallery/headshot.jpg')?.has('gallery'));
  assert.ok(refs.get(HARDCODED_REFS[0].sourcePath)?.has('hero'));
  assert.ok(refs.get(HARDCODED_REFS[1].sourcePath)?.has('banner'));
  for (const sourcePath of refs.keys()) {
    assert.ok(!sourcePath.includes('/_derived/'), sourcePath);
  }
});

test('outputIsFresh requires dest + matching sha/recipe/width', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opt-img-'));
  const destAbs = path.join(dir, '840.webp');
  const sourceSha256 = 'a'.repeat(64);
  const existingEntry = {
    sourceSha256,
    recipeVersion: RECIPE_VERSION,
    outputs: [{ width: 840, format: 'webp' }],
  };
  assert.equal(
    outputIsFresh({ destAbs, sourceSha256, recipeVersion: RECIPE_VERSION, existingEntry }),
    false,
  );
  fs.writeFileSync(destAbs, 'x');
  assert.equal(
    outputIsFresh({ destAbs, sourceSha256, recipeVersion: RECIPE_VERSION, existingEntry }),
    true,
  );
  assert.equal(
    outputIsFresh({
      destAbs,
      sourceSha256,
      recipeVersion: RECIPE_VERSION + 1,
      existingEntry,
    }),
    false,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});
