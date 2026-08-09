/**
 * Shared gallery Studio metadata: fixed tags + slug filename rules.
 * Existing content may still carry older freeform tags; Studio cannot add new ones.
 */

/** Allowlisted gallery filter tags (Studio chips + Gemini). */
export const GALLERY_TAG_VALUES = [
  'cabaret',
  'headshot',
  'life',
  'new-york',
  'performance',
  'portrait',
  'rehearsal',
  'training',
  'travel',
];

export const GALLERY_TAG_SET = new Set(GALLERY_TAG_VALUES);

/** Max length of the slug basename (without `.md`). */
export const GALLERY_SLUG_MAX_LENGTH = 80;

/**
 * Lowercase URL-safe slug: `a-z`, `0-9`, single hyphens between segments.
 * Optional trailing `.md` is stripped before matching.
 */
export const GALLERY_SLUG_BASENAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @param {unknown} tags
 * @returns {{ tags: string[], rejected: string[] }}
 */
export function normalizeGalleryTags(tags) {
  const raw = Array.isArray(tags) ? tags : [];
  /** @type {string[]} */
  const accepted = [];
  /** @type {string[]} */
  const rejected = [];
  for (const item of raw) {
    const tag = String(item || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
    if (!tag) continue;
    if (GALLERY_TAG_SET.has(tag)) {
      if (!accepted.includes(tag)) accepted.push(tag);
    } else {
      if (!rejected.includes(tag)) rejected.push(tag);
    }
  }
  return { tags: accepted, rejected };
}

/**
 * Strip a trailing `.md` (any case) so Studio can re-attach the extension.
 * @param {string} raw
 */
export function stripGalleryMarkdownExtension(raw) {
  return String(raw || '')
    .trim()
    .replace(/\.md$/i, '')
    .trim();
}

/**
 * Normalize user slug input: trim, lowercase, strip `.md`.
 * Does not rewrite illegal characters — validation reports those.
 * @param {unknown} raw
 */
export function normalizeGallerySlugInput(raw) {
  return stripGalleryMarkdownExtension(String(raw ?? '').trim().toLowerCase());
}

/**
 * Validate an optional gallery content filename slug.
 * Empty input is allowed (server auto-names from the photo).
 *
 * @param {unknown} raw
 * @returns {{
 *   ok: boolean,
 *   empty: boolean,
 *   slug: string,
 *   filename: string,
 *   repoPath: string,
 *   error: string | null,
 * }}
 */
export function validateGallerySlug(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return {
      ok: true,
      empty: true,
      slug: '',
      filename: '',
      repoPath: '',
      error: null,
    };
  }

  // Reject path tricks before stripping extension.
  if (/[\\/]|\.\./.test(trimmed)) {
    return {
      ok: false,
      empty: false,
      slug: '',
      filename: '',
      repoPath: '',
      error: 'Don’t include folders or “..” — only the file name for this gallery entry.',
    };
  }

  const slug = normalizeGallerySlugInput(trimmed);
  if (!slug) {
    return {
      ok: false,
      empty: false,
      slug: '',
      filename: '',
      repoPath: '',
      error: 'Enter a name before .md, or leave the field blank to auto-name from the photo.',
    };
  }

  if (/\.[a-z0-9]+$/i.test(slug)) {
    return {
      ok: false,
      empty: false,
      slug: '',
      filename: '',
      repoPath: '',
      error: 'Use the .md extension only (or omit it). Other file extensions aren’t allowed.',
    };
  }

  if (slug.length > GALLERY_SLUG_MAX_LENGTH) {
    return {
      ok: false,
      empty: false,
      slug: '',
      filename: '',
      repoPath: '',
      error: `Keep the name to ${GALLERY_SLUG_MAX_LENGTH} characters or fewer (not counting .md).`,
    };
  }

  if (!GALLERY_SLUG_BASENAME_PATTERN.test(slug)) {
    return {
      ok: false,
      empty: false,
      slug: '',
      filename: '',
      repoPath: '',
      error:
        'Use lowercase letters, numbers, and single hyphens only (e.g. nyc-winter-headshot). No spaces or special characters.',
    };
  }

  const filename = `${slug}.md`;
  return {
    ok: true,
    empty: false,
    slug,
    filename,
    repoPath: `src/content/gallery/${filename}`,
    error: null,
  };
}
