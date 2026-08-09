/**
 * Browser-safe re-exports of gallery Studio rules (shared with the API).
 */
export {
  GALLERY_SLUG_BASENAME_PATTERN,
  GALLERY_SLUG_MAX_LENGTH,
  GALLERY_TAG_SET,
  GALLERY_TAG_VALUES,
  normalizeGallerySlugInput,
  normalizeGalleryTags,
  stripGalleryMarkdownExtension,
  validateGallerySlug,
} from '../../api/src/lib/galleryMeta.js';
