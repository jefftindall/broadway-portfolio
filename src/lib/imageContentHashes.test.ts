import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildPublicImageHashIndex } from './imageContentHashes.ts';

test('buildPublicImageHashIndex indexes gallery, photos, shows, and lessons by sha256', () => {
  const index = buildPublicImageHashIndex();
  assert.ok(Object.keys(index).length > 10);

  const samples = [
    ['public/images/gallery/headshot.jpg', '/images/gallery/headshot.jpg'],
    ['public/images/shows/anastasia.jpg', '/images/shows/anastasia.jpg'],
    ['public/images/lessons/lessons-banner.jpg', '/images/lessons/lessons-banner.jpg'],
  ] as const;
  for (const [sampleRel, publicPath] of samples) {
    const abs = path.join(process.cwd(), sampleRel);
    assert.ok(fs.existsSync(abs), `expected ${sampleRel}`);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    assert.equal(index[hash], publicPath);
  }
  assert.ok(!Object.values(index).some((p) => p.includes('/instagram/')));
  assert.ok(!Object.values(index).some((p) => p.includes('/_derived/')));
});
