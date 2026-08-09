import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GALLERY_TAG_VALUES,
  normalizeGalleryTags,
  validateGallerySlug,
} from './galleryMeta.js';
import { buildContentChange } from './gemini.js';

test('normalizeGalleryTags keeps allowlisted tags only', () => {
  const { tags, rejected } = normalizeGalleryTags([
    'Headshot',
    'portrait',
    'made-up-tag',
    ' new-york ',
    'portrait',
  ]);
  assert.deepEqual(tags, ['headshot', 'portrait', 'new-york']);
  assert.deepEqual(rejected, ['made-up-tag']);
  assert.ok(GALLERY_TAG_VALUES.includes('performance'));
});

test('validateGallerySlug accepts blank, basename, and .md', () => {
  assert.equal(validateGallerySlug('').ok, true);
  assert.equal(validateGallerySlug('').empty, true);

  const bare = validateGallerySlug('nyc-winter-headshot');
  assert.equal(bare.ok, true);
  assert.equal(bare.slug, 'nyc-winter-headshot');
  assert.equal(bare.filename, 'nyc-winter-headshot.md');
  assert.equal(bare.repoPath, 'src/content/gallery/nyc-winter-headshot.md');

  const withExt = validateGallerySlug('NYC-Winter-Headshot.MD');
  assert.equal(withExt.ok, true);
  assert.equal(withExt.slug, 'nyc-winter-headshot');
  assert.equal(withExt.filename, 'nyc-winter-headshot.md');
});

test('validateGallerySlug rejects unsafe or malformed names', () => {
  assert.equal(validateGallerySlug('has spaces').ok, false);
  assert.equal(validateGallerySlug('Upper_Case').ok, false);
  assert.equal(validateGallerySlug('../secret').ok, false);
  assert.equal(validateGallerySlug('photo.jpg').ok, false);
  assert.equal(validateGallerySlug('-leading').ok, false);
  assert.equal(validateGallerySlug('trailing-').ok, false);
  assert.ok(validateGallerySlug('has spaces').error);
});

test('buildContentChange drops unknown gallery tags and normalizes slug .md', async () => {
  const change = await buildContentChange(
    'add_gallery_photo',
    {
      slug: 'My-Show-Photo.MD',
      image: '/images/photos/pending.jpg',
      tags: ['performance', 'invented-tag', 'cabaret'],
    },
    undefined,
  );
  assert.equal(change.path, 'src/content/gallery/my-show-photo.md');
  assert.deepEqual(change.preview?.tags, ['performance', 'cabaret']);
  assert.doesNotMatch(change.content, /invented-tag/);
});

test('buildContentChange rejects invalid gallery slug characters', async () => {
  await assert.rejects(
    () =>
      buildContentChange(
        'add_gallery_photo',
        {
          slug: 'not a slug!',
          image: '/images/photos/pending.jpg',
          tags: ['portrait'],
        },
        undefined,
      ),
    (err) => err instanceof Error && err.name === 'StudioContentValidationError',
  );
});
