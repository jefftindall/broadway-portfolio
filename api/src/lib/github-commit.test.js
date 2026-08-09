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

test('buildPublishCommitMessage prefers content message and notes image', () => {
  assert.equal(
    buildPublishCommitMessage([{ commitMessage: 'content: gallery abc' }]),
    'content: gallery abc',
  );
  assert.equal(
    buildPublishCommitMessage([{ commitMessage: 'content: gallery abc' }], [
      { path: 'public/images/photos/1.jpg' },
    ]),
    'content: gallery abc (+ image)',
  );
  assert.equal(
    buildPublishCommitMessage(
      [{ commitMessage: 'content: a' }, { commitMessage: 'content: b' }],
      [],
    ),
    'content: a; content: b',
  );
  assert.equal(
    buildPublishCommitMessage([{ commitMessage: 'media: upload x.jpg' }], [
      { path: 'public/images/photos/x.jpg' },
    ]),
    'media: upload x.jpg',
  );
});
