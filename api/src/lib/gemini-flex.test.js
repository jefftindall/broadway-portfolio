import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContentChange, isAllowedContentPath, normalizeLessonRates } from './gemini.js';
import { validateContentFile, StudioContentValidationError } from './contentValidate.js';
import { DEFAULT_SITE_SETTINGS, SITE_SETTINGS_PATH } from './siteSettings.js';
import { siteSettingsSchema } from './contentSchemas.js';

test('normalizeLessonRates accepts both allowlisted ids with priceAmount', () => {
  const rates = normalizeLessonRates([
    { id: '30min', label: '30-minute session', price: '$65', priceAmount: 65 },
    { id: '60min', label: '60-minute session', price: '$110', priceAmount: 110 },
  ]);
  assert.equal(rates.length, 2);
  assert.equal(rates[0].id, '30min');
  assert.equal(rates[0].priceAmount, 65);
  assert.equal(rates[1].id, '60min');
  assert.equal(rates[1].priceAmount, 110);
});

test('normalizeLessonRates rejects unknown rate ids', () => {
  assert.throws(
    () =>
      normalizeLessonRates([
        { id: '90min', label: '90-minute', price: '$150', priceAmount: 150 },
        { id: '30min', label: '30-minute session', price: '$60', priceAmount: 60 },
      ]),
    /30-minute and 60-minute/,
  );
});

test('normalizeLessonRates rejects missing priceAmount and unparseable price', () => {
  assert.throws(
    () =>
      normalizeLessonRates([
        { id: '30min', label: '30-minute session', price: 'free' },
        { id: '60min', label: '60-minute session', price: '$100', priceAmount: 100 },
      ]),
    /dollar amount/,
  );
});

test('normalizeLessonRates requires both tiers', () => {
  assert.throws(
    () =>
      normalizeLessonRates([{ id: '30min', label: '30-minute session', price: '$60', priceAmount: 60 }]),
    /both 30-minute and 60-minute/,
  );
});

test('isAllowedContentPath allows shows news gallery lessons book casting photos settings', () => {
  assert.equal(isAllowedContentPath('src/content/shows/anastasia.md'), true);
  assert.equal(isAllowedContentPath('src/content/news/hello.md'), true);
  assert.equal(isAllowedContentPath('src/content/gallery/headshot.md'), true);
  assert.equal(isAllowedContentPath('src/content/pages/lessons.md'), true);
  assert.equal(isAllowedContentPath('src/content/pages/lessons-book.md'), true);
  assert.equal(isAllowedContentPath('src/content/casting/musical-theatre-actress.md'), true);
  assert.equal(isAllowedContentPath('public/images/photos/foo.jpg'), true);
  assert.equal(isAllowedContentPath(SITE_SETTINGS_PATH), true);
});

test('isAllowedContentPath denies about and unknown paths', () => {
  assert.equal(isAllowedContentPath('src/content/pages/about.md'), false);
  assert.equal(isAllowedContentPath('src/lib/site.ts'), false);
  assert.equal(isAllowedContentPath('src/data/other.json'), false);
  assert.equal(isAllowedContentPath('../etc/passwd'), false);
  assert.equal(isAllowedContentPath('/absolute.md'), false);
});

test('DEFAULT_SITE_SETTINGS matches site-settings schema (bootstrap when GitHub file missing)', () => {
  const parsed = siteSettingsSchema.parse(DEFAULT_SITE_SETTINGS);
  assert.equal(parsed.performer.availability, 'Available');
  assert.ok(parsed.reelUrl.startsWith('https://'));
});

test('validateContentFile accepts site-settings JSON', () => {
  const content = JSON.stringify(
    {
      reelUrl: 'https://youtu.be/41jdPTkN_Sw',
      shortBio: 'A short bio for About.',
      pressQuote: {
        quote: 'The funniest actor you’ve never seen.',
        attribution: 'Tiffany King',
      },
      performer: {
        vocalType: 'Mezzo',
        vocalRange: 'D3-G6',
        union: 'Non-union',
        availability: 'Available',
      },
    },
    null,
    2,
  );
  assert.doesNotThrow(() => validateContentFile(SITE_SETTINGS_PATH, content));
});

test('validateContentFile rejects invalid site-settings', () => {
  assert.throws(
    () => validateContentFile(SITE_SETTINGS_PATH, JSON.stringify({ reelUrl: 'not-a-url' })),
    (err) => err instanceof StudioContentValidationError,
  );
});

test('lessons-book rates require ids in frontmatter validation', () => {
  const bad = `---
title: Book
description: Rates
rates:
  - label: "30-minute session"
    price: "$60"
    priceAmount: 60
---

Body
`;
  assert.throws(
    () => validateContentFile('src/content/pages/lessons-book.md', bad),
    (err) => err instanceof StudioContentValidationError,
  );

  const good = `---
title: Book
description: Rates
rates:
  - id: "30min"
    label: "30-minute session"
    price: "$60"
    priceAmount: 60
  - id: "60min"
    label: "60-minute session"
    price: "$100"
    priceAmount: 100
---

Body
`;
  assert.doesNotThrow(() => validateContentFile('src/content/pages/lessons-book.md', good));
});

test('buildContentChange add_gallery_photo writes gallery markdown + preview', async () => {
  const before = Date.now();
  const change = await buildContentChange(
    'add_gallery_photo',
    {
      slug: 'nyc-winter-headshot',
      image: '/images/photos/pending-headshot.jpg',
      tags: ['headshot', 'portrait'],
      order: 52,
      focus: '50% 28%',
    },
    undefined,
  );
  const after = Date.now();
  assert.equal(change.tool, 'add_gallery_photo');
  assert.equal(change.path, 'src/content/gallery/nyc-winter-headshot.md');
  assert.equal(change.livePath, '/gallery');
  assert.equal(change.preview?.kind, 'gallery');
  assert.equal(change.preview?.focus, '50% 28%');
  assert.equal(change.preview?.order, undefined);
  assert.deepEqual(change.preview?.tags, ['headshot', 'portrait']);
  assert.doesNotThrow(() => validateContentFile(change.path, change.content));
  assert.match(change.content, /image: "\/images\/photos\/pending-headshot\.jpg"/);
  assert.match(change.content, /focus: "50% 28%"/);
  assert.doesNotMatch(change.content, /caption:/);
  const orderMatch = change.content.match(/^order:\s*(-?\d+)$/m);
  assert.ok(orderMatch, 'auto order should be written');
  const order = Number(orderMatch[1]);
  assert.ok(order <= -before && order >= -after, `order ${order} should be -Date.now()`);
  assert.doesNotMatch(change.content, /^order:\s*52$/m);
});

test('buildContentChange add_gallery_photo uses attached photoPath when image omitted', async () => {
  const change = await buildContentChange(
    'add_gallery_photo',
    { tags: ['performance'] },
    '/images/photos/pending-show.jpg',
  );
  assert.equal(change.path, 'src/content/gallery/pending-show.md');
  assert.equal(change.preview?.image, '/images/photos/pending-show.jpg');
  assert.doesNotThrow(() => validateContentFile(change.path, change.content));
});
