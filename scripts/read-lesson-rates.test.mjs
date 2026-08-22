import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lessonRatesForTerraform, parseLessonRates } from './read-lesson-rates.mjs';

const lessonsBook = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'pages', 'lessons-book.md'),
  'utf8',
);

test('parseLessonRates reads advertised 30min/60min amounts', () => {
  const rates = parseLessonRates(lessonsBook);
  assert.deepEqual(
    rates.map((rate) => ({ id: rate.id, priceAmount: rate.priceAmount })),
    [
      { id: '30min', priceAmount: 60 },
      { id: '60min', priceAmount: 100 },
    ],
  );
});

test('lessonRatesForTerraform emits string cents for Stripe unit_amount', () => {
  const result = lessonRatesForTerraform(lessonsBook);
  assert.equal(result.ids, '30min,60min');
  assert.equal(result['30min_cents'], '6000');
  assert.equal(result['60min_cents'], '10000');
  assert.equal(result['30min_label'], '30-minute session');
  assert.equal(result['60min_label'], '60-minute session');
});

test('parseLessonRates rejects missing required ids', () => {
  const md = `---
title: x
description: y
rates:
  - id: "30min"
    label: "30-minute session"
    price: "$60"
    priceAmount: 60
---
`;
  assert.throws(() => parseLessonRates(md), /60min/);
});
