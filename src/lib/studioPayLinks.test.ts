import assert from 'node:assert/strict';
import test from 'node:test';
import { primaryPayLinkAction } from './studioPayLinks.ts';

test('primaryPayLinkAction prefers copy on desktop', () => {
  assert.equal(primaryPayLinkAction(true, false), 'copy');
});

test('primaryPayLinkAction prefers share on mobile when available', () => {
  assert.equal(primaryPayLinkAction(true, true), 'share');
});

test('primaryPayLinkAction falls back to copy without share API', () => {
  assert.equal(primaryPayLinkAction(false, true), 'copy');
});
