import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encodeBlobContent,
  isGithubTipRaceError,
  isTransientGithubError,
  withGithubRetry,
} from './github.js';
import { buildPublishCommitMessage } from './gemini.js';

test('isTransientGithubError recognizes status and network failures', () => {
  assert.equal(isTransientGithubError({ status: 429 }), true);
  assert.equal(isTransientGithubError({ status: 503 }), true);
  assert.equal(isTransientGithubError({ status: 500 }), true);
  assert.equal(isTransientGithubError({ status: 502 }), true);
  assert.equal(isTransientGithubError({ code: 'ECONNRESET' }), true);
  assert.equal(isTransientGithubError({ cause: { code: 'ETIMEDOUT' } }), true);
  assert.equal(isTransientGithubError({ message: 'socket hang up' }), true);
  assert.equal(isTransientGithubError({ status: 400, message: 'bad request' }), false);
  assert.equal(isTransientGithubError({ status: 401 }), false);
  assert.equal(isTransientGithubError(null), false);
});

test('isGithubTipRaceError only matches fast-forward races', () => {
  assert.equal(
    isGithubTipRaceError({ status: 422, message: 'Update is not a fast forward' }),
    true,
  );
  assert.equal(isGithubTipRaceError({ status: 409, message: 'Conflict' }), true);
  assert.equal(
    isGithubTipRaceError({
      status: 422,
      message: 'Cannot update this protected ref',
    }),
    false,
  );
  assert.equal(
    isGithubTipRaceError({
      status: 403,
      message: 'Resource not accessible by integration',
    }),
    false,
  );
});

test('encodeBlobContent handles text and binary', () => {
  assert.equal(encodeBlobContent({ content: 'hello', binary: false }), Buffer.from('hello').toString('base64'));
  assert.equal(encodeBlobContent({ content: 'aGVsbG8=', binary: true }), 'aGVsbG8=');
  assert.equal(
    encodeBlobContent({ content: Buffer.from('hi'), binary: true }),
    Buffer.from('hi').toString('base64'),
  );
});

test('withGithubRetry retries transient errors then succeeds', async () => {
  let attempts = 0;
  const result = await withGithubRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        const err = new Error('upstream');
        err.status = 502;
        throw err;
      }
      return 'ok';
    },
    { label: 'test', maxAttempts: 4 },
  );
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('withGithubRetry does not retry permanent errors', async () => {
  let attempts = 0;
  await assert.rejects(
    async () =>
      withGithubRetry(
        async () => {
          attempts += 1;
          const err = new Error('forbidden');
          err.status = 403;
          throw err;
        },
        { label: 'test', maxAttempts: 4 },
      ),
    /forbidden/,
  );
  assert.equal(attempts, 1);
});

test('withGithubRetry retries tip races', async () => {
  let attempts = 0;
  const result = await withGithubRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        const err = new Error('Update is not a fast forward');
        err.status = 422;
        throw err;
      }
      return 'committed';
    },
    { label: 'tip', maxAttempts: 3 },
  );
  assert.equal(result, 'committed');
  assert.equal(attempts, 2);
});

test('buildPublishCommitMessage includes tool, paths, and params', () => {
  const msg = buildPublishCommitMessage(
    [
      {
        tool: 'add_gallery_photo',
        path: 'src/content/gallery/nyc-headshot.md',
        content: `---
image: "/images/photos/123-nyc-headshot.jpg"
tags:
  - "headshot"
  - "theatre"
focus: "center"
order: -1
---
`,
        commitMessage: 'studio: add_gallery_photo nyc-headshot.md',
        commitParams: {
          slug: 'nyc-headshot',
          tags: ['headshot', 'theatre'],
          focus: 'center',
          image: '/images/photos/123-nyc-headshot.jpg',
        },
      },
    ],
    [{ path: 'public/images/photos/123-nyc-headshot.jpg' }],
  );
  assert.match(msg, /^studio: add_gallery_photo nyc-headshot\.md \(\+image\)\n/);
  assert.match(msg, /Tool: add_gallery_photo/);
  assert.match(msg, /- src\/content\/gallery\/nyc-headshot\.md/);
  assert.match(msg, /- public\/images\/photos\/123-nyc-headshot\.jpg/);
  assert.match(msg, /Params:/);
  assert.match(msg, /- tags: headshot, theatre/);
  assert.match(msg, /- focus: center/);
  assert.match(msg, /- image: \/images\/photos\/123-nyc-headshot\.jpg/);
});

test('buildPublishCommitMessage extracts params from markdown when commitParams omitted', () => {
  const msg = buildPublishCommitMessage([
    {
      tool: 'upsert_show',
      path: 'src/content/shows/hamilton.md',
      content: `---
title: "Hamilton"
year: 2026
role: "Eliza"
venue: "Demo Theatre - New York, NY"
featured: true
---
Body
`,
      commitMessage: 'studio: upsert_show hamilton.md',
    },
  ]);
  assert.match(msg, /^studio: upsert_show hamilton\.md\n/);
  assert.match(msg, /- title: Hamilton/);
  assert.match(msg, /- year: 2026/);
  assert.match(msg, /- role: Eliza/);
  assert.match(msg, /- featured: true/);
});

test('buildPublishCommitMessage summarizes lesson rates', () => {
  const msg = buildPublishCommitMessage([
    {
      tool: 'update_lesson_rates',
      path: 'src/content/pages/lessons-book.md',
      content: '---\nrates: []\n---\n',
      commitParams: { rates: '30min=$60; 60min=$110' },
    },
  ]);
  assert.match(msg, /Tool: update_lesson_rates/);
  assert.match(msg, /- rates: 30min=\$60; 60min=\$110/);
});
