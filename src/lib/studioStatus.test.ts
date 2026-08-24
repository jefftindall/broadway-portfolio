import assert from 'node:assert/strict';
import test from 'node:test';
import { busyStatusChildrenMarkup } from './studioStatus.ts';

test('busyStatusChildrenMarkup includes spinner and message', () => {
  const html = busyStatusChildrenMarkup('Loading people…');
  assert.match(html, /busy-spinner/);
  assert.match(html, /Loading people…/);
});

test('busyStatusChildrenMarkup escapes HTML in messages', () => {
  const html = busyStatusChildrenMarkup('<unsafe>');
  assert.match(html, /&lt;unsafe&gt;/);
});
