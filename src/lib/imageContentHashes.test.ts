import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildPublicImageHashIndex } from './imageContentHashes.ts';

test('buildPublicImageHashIndex indexes gallery and photos by sha256', () => {
  const index = buildPublicImageHashIndex();
  assert.ok(Object.keys(index).length > 10);

  const sampleRel = 'public/images/gallery/headshot.jpg';
  const abs = path.join(process.cwd(), sampleRel);
  assert.ok(fs.existsSync(abs), 'expected headshot fixture');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  assert.equal(index[hash], '/images/gallery/headshot.jpg');
  assert.ok(!Object.values(index).some((p) => p.includes('/instagram/')));
});
