import matter from 'gray-matter';
import {
  castingFrontmatterSchema,
  galleryFrontmatterSchema,
  lessonsBookFrontmatterSchema,
  newsFrontmatterSchema,
  pagesFrontmatterSchema,
  showFrontmatterSchema,
  siteSettingsSchema,
} from './contentSchemas.js';
import { SITE_SETTINGS_PATH } from './siteSettings.js';

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
 * @returns {{ schema: import('zod').ZodTypeAny, kind?: 'json' | 'markdown' } | null}
 */
function schemaForContentPath(path) {
  const p = String(path || '').replace(/\\/g, '/');
  if (p === SITE_SETTINGS_PATH) {
    return { schema: siteSettingsSchema, kind: 'json' };
  }
  if (/^src\/content\/shows\/[^/]+\.md$/.test(p)) {
    return { schema: showFrontmatterSchema, kind: 'markdown' };
  }
  if (/^src\/content\/news\/[^/]+\.md$/.test(p)) {
    return { schema: newsFrontmatterSchema, kind: 'markdown' };
  }
  if (/^src\/content\/gallery\/[^/]+\.md$/.test(p)) {
    return { schema: galleryFrontmatterSchema, kind: 'markdown' };
  }
  if (p === LESSONS_BOOK_PAGE) {
    return { schema: lessonsBookFrontmatterSchema, kind: 'markdown' };
  }
  if (p === 'src/content/pages/lessons.md') {
    return { schema: pagesFrontmatterSchema, kind: 'markdown' };
  }
  if (/^src\/content\/casting\/[^/]+\.md$/.test(p)) {
    return { schema: castingFrontmatterSchema, kind: 'markdown' };
  }
  return null;
}

/**
 * Validate markdown or site-settings JSON against Zod schemas.
 * @param {string} path
 * @param {string} content
 */
export function validateContentFile(path, content) {
  const normalizedPath = String(path || '').replace(/\\/g, '/');
  const rule = schemaForContentPath(normalizedPath);
  if (!rule) return;

  if (rule.kind === 'json') {
    let data;
    try {
      data = JSON.parse(String(content ?? ''));
    } catch {
      throw new StudioContentValidationError(
        'Settings could not be parsed. Review the preview fields before publishing.',
        { path: normalizedPath },
      );
    }
    const result = rule.schema.safeParse(data);
    if (result.success) return;
    throw new StudioContentValidationError(
      'Some settings fields are invalid. Review the preview and fix missing or incorrect values before publishing.',
      {
        path: normalizedPath,
        issues: result.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      },
    );
  }

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
