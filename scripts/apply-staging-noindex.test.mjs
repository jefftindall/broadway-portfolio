import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  STAGING_ROBOTS_TXT,
  STAGING_X_ROBOTS_TAG,
  applyStagingNoIndex,
} from './apply-staging-noindex.mjs';

test('applyStagingNoIndex writes Disallow: / and X-Robots-Tag without dropping other global headers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-noindex-'));
  const configPath = path.join(dir, 'staticwebapp.config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        globalHeaders: {
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store',
        },
        routes: [{ route: '/*', headers: { 'Cache-Control': 'public, max-age=30' } }],
      },
      null,
      2,
    ),
    'utf8',
  );
  fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://elysetindall.com/sitemap-index.xml\n');

  applyStagingNoIndex(dir);

  assert.equal(fs.readFileSync(path.join(dir, 'robots.txt'), 'utf8'), STAGING_ROBOTS_TXT);
  const patched = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(patched.globalHeaders['X-Robots-Tag'], STAGING_X_ROBOTS_TAG);
  assert.equal(patched.globalHeaders['X-Content-Type-Options'], 'nosniff');
  assert.equal(patched.globalHeaders['Cache-Control'], 'private, no-store');
  assert.equal(patched.routes[0].headers['Cache-Control'], 'public, max-age=30');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('applyStagingNoIndex fails when staticwebapp.config.json is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-noindex-missing-'));
  assert.throws(() => applyStagingNoIndex(dir), /Missing /);
  fs.rmSync(dir, { recursive: true, force: true });
});
