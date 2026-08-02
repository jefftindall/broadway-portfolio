import matter from 'gray-matter';
import {
  castingFrontmatterSchema,
  galleryFrontmatterSchema,
  lessonsBookFrontmatterSchema,
  newsFrontmatterSchema,
  pagesFrontmatterSchema,
  showFrontmatterSchema,
} from './contentSchemas.js';

const LESSONS_BOOK_PAGE = 'src/content/pages/lessons-book.md';

/**
 * Raised when markdown frontmatter fails schema validation before publish.
 */
export class StudioContentValidationError extends Error {
  /**
   * @param {string} message
   * @param {{ path?: string, issues?: Array<{ path: (string|number)[], message: string }> }} [details]
   */
  constructor(message, details = {}) {
    super(message);
    this.name = 'StudioContentValidationError';
    this.path = details.path;
    this.issues = details.issues || [];
  }
}

/**
 * @param {string} path
 * @returns {{ schema: import('zod').ZodTypeAny } | null}
 */
function schemaForContentPath(path) {
  const p = String(path || '').replace(/\\/g, '/');
  if (/^src\/content\/shows\/[^/]+\.md$/.test(p)) {
    return { schema: showFrontmatterSchema };
  }
  if (/^src\/content\/news\/[^/]+\.md$/.test(p)) {
    return { schema: newsFrontmatterSchema };
  }
  if (/^src\/content\/gallery\/[^/]+\.md$/.test(p)) {
    return { schema: galleryFrontmatterSchema };
  }
  if (p === LESSONS_BOOK_PAGE) {
    return { schema: lessonsBookFrontmatterSchema };
  }
  if (/^src\/content\/pages\/[^/]+\.md$/.test(p)) {
    return { schema: pagesFrontmatterSchema };
  }
  if (/^src\/content\/casting\/[^/]+\.md$/.test(p)) {
    return { schema: castingFrontmatterSchema };
  }
  return null;
}

/**
 * Validate markdown content against the same Zod schemas used by Astro build.
 * @param {string} path
 * @param {string} content
 */
export function validateContentFile(path, content) {
  const normalizedPath = String(path || '').replace(/\\/g, '/');
  const rule = schemaForContentPath(normalizedPath);
  if (!rule) return;

  let parsed;
  try {
    parsed = matter(String(content ?? ''));
  } catch {
    throw new StudioContentValidationError(
      'Content could not be parsed. Check the frontmatter formatting in the preview.',
      { path: normalizedPath },
    );
  }

  const result = rule.schema.safeParse(parsed.data);
  if (result.success) return;

  throw new StudioContentValidationError(
    'Some content fields are invalid. Review the preview and fix missing or incorrect values before publishing.',
    {
      path: normalizedPath,
      issues: result.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    },
  );
}
