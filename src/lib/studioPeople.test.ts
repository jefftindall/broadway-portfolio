import assert from 'node:assert/strict';
import test from 'node:test';
import { careerRecencyLabel, formatUsdFromCents } from './studioPeople.ts';

test('formatUsdFromCents formats student LTV and leaves empty as an em dash', () => {
  assert.equal(formatUsdFromCents(0), '$0.00');
  assert.equal(formatUsdFromCents(10000), '$100.00');
  assert.equal(formatUsdFromCents(null), '—');
});

test('careerRecencyLabel is a date distance, not a public score', () => {
  const now = new Date('2026-08-23T12:00:00.000Z');
  assert.equal(careerRecencyLabel('2026-08-23', now), 'Today');
  assert.equal(careerRecencyLabel('2026-08-22', now), 'Yesterday');
  assert.equal(careerRecencyLabel('2026-08-01', now), '22 days ago');
  assert.equal(careerRecencyLabel('', now), 'No date yet');
});
