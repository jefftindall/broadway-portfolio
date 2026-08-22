import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isStagingStudioBranchExpired,
  parseStagingStudioBranchDate,
  stagingStudioBranchName,
  stagingStudioPrBody,
  stagingStudioPrTitle,
  studioPublishMode,
} from './studioPublish.js';

test('stagingStudioBranchName uses UTC YYYYMMDD', () => {
  const d = new Date(Date.UTC(2026, 7, 9, 23, 30, 0));
  assert.equal(stagingStudioBranchName(d), 'staging-studio-20260809');
});

test('stagingStudioBranchName rolls at UTC midnight', () => {
  const before = new Date(Date.UTC(2026, 7, 9, 23, 59, 59));
  const after = new Date(Date.UTC(2026, 7, 10, 0, 0, 0));
  assert.equal(stagingStudioBranchName(before), 'staging-studio-20260809');
  assert.equal(stagingStudioBranchName(after), 'staging-studio-20260810');
});

test('parseStagingStudioBranchDate accepts valid names', () => {
  assert.equal(parseStagingStudioBranchDate('staging-studio-20260809'), Date.UTC(2026, 7, 9));
});

test('parseStagingStudioBranchDate rejects garbage and impossible dates', () => {
  assert.equal(parseStagingStudioBranchDate('main'), null);
  assert.equal(parseStagingStudioBranchDate('staging-studio-2026'), null);
  assert.equal(parseStagingStudioBranchDate('staging-studio-20260231'), null);
  assert.equal(parseStagingStudioBranchDate('feature/staging-studio-20260809'), null);
});

test('isStagingStudioBranchExpired is true only after max age days', () => {
  const now = new Date(Date.UTC(2026, 7, 9));
  // 28 days before 2026-08-09 is 2026-07-12; branch dated 2026-07-11 is expired
  assert.equal(isStagingStudioBranchExpired('staging-studio-20260711', now, 28), true);
  // exactly 28 days ago (2026-07-12) is NOT older than 28 days
  assert.equal(isStagingStudioBranchExpired('staging-studio-20260712', now, 28), false);
  assert.equal(isStagingStudioBranchExpired('staging-studio-20260809', now, 28), false);
  assert.equal(isStagingStudioBranchExpired('main', now, 28), false);
});

test('stagingStudioPrTitle and body mention branch and CD: staging workflow', () => {
  const now = new Date(Date.UTC(2026, 7, 9));
  assert.equal(stagingStudioPrTitle(now), 'Studio staging 2026-08-09');
  const body = stagingStudioPrBody({ branch: 'staging-studio-20260809', base: 'main' });
  assert.match(body, /staging-studio-20260809/);
  assert.match(body, /CD: staging/);
  assert.match(body, /28 days/);
});

test('studioPublishMode defaults to direct and accepts pr', () => {
  const prev = process.env.STUDIO_PUBLISH_MODE;
  try {
    delete process.env.STUDIO_PUBLISH_MODE;
    assert.equal(studioPublishMode(), 'direct');
    process.env.STUDIO_PUBLISH_MODE = 'pr';
    assert.equal(studioPublishMode(), 'pr');
    process.env.STUDIO_PUBLISH_MODE = 'PR';
    assert.equal(studioPublishMode(), 'pr');
    process.env.STUDIO_PUBLISH_MODE = 'other';
    assert.equal(studioPublishMode(), 'direct');
  } finally {
    if (prev === undefined) delete process.env.STUDIO_PUBLISH_MODE;
    else process.env.STUDIO_PUBLISH_MODE = prev;
  }
});
