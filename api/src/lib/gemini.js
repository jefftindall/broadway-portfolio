import { GoogleGenerativeAI } from '@google/generative-ai';
import matter from 'gray-matter';
import { trackEvent } from './telemetry.js';
import slugify from 'slugify';
import { commitFiles, listRepoFiles, readRepoTextFile, toFrontmatter } from './github.js';
import { validateContentFile, StudioContentValidationError } from './contentValidate.js';
import {
  LESSON_RATE_DEFS,
  LESSON_RATE_ID_VALUES,
  PERFORMER_FACT_KEYS,
} from './contentSchemas.js';
import {
  GALLERY_TAG_VALUES,
  normalizeGalleryTags,
  validateGallerySlug,
} from './galleryMeta.js';
import { SITE_SETTINGS_PATH, mergeSiteSettings, readSiteSettings } from './siteSettings.js';

const LESSONS_PAGE = 'src/content/pages/lessons.md';
const LESSONS_BOOK_PAGE = 'src/content/pages/lessons-book.md';

const lessonRateSchema = {
  type: 'OBJECT',
  properties: {
    id: {
      type: 'STRING',
      description: 'Stable rate id: exactly "30min" or "60min"',
    },
    label: { type: 'STRING', description: 'Session label, e.g. 30-minute session' },
    price: { type: 'STRING', description: 'Display price, e.g. $60' },
    priceAmount: {
      type: 'NUMBER',
      description: 'Numeric USD amount (required), e.g. 60',
    },
  },
  required: ['id', 'label', 'price', 'priceAmount'],
};

const tools = [
  {
    // Keep src/lib/studioHelp.ts (+ /studio/help) in sync when adding/changing tools.
    // See docs/runbooks/refine-studio-gemini.md and .cursor/rules/studio-help.mdc.
    functionDeclarations: [
      {
        name: 'upsert_show',
        description: 'Create or update a show credit on the portfolio.',
        parameters: {
          type: 'OBJECT',
          properties: {
            slug: { type: 'STRING', description: 'URL slug, e.g. anastasia' },
            title: { type: 'STRING' },
            year: { type: 'NUMBER' },
            role: { type: 'STRING' },
            venue: {
              type: 'STRING',
              description:
                'Theater/company and city only, formatted exactly as "[Theater Name] - [City], [ST]" (e.g. "Strand Theater - Marietta, GA" or "Don\'t Tell Mama - New York, NY"). Do not put room names, galleries, program tags, co-producers, or other detail here — put those in synopsis/body.',
            },
            synopsis: { type: 'STRING' },
            body: {
              type: 'STRING',
              description:
                'Longer markdown body. Use this for room/gallery names, program context (e.g. Camp Broadway, TYA/USA), co-producers, and other venue detail that does not belong in the short venue line.',
            },
            featured: {
              type: 'BOOLEAN',
              description:
                'If true, eligible for homepage Stage & reel (three most recent featured by year, then order). Use sparingly for headline credits only.',
            },
            order: {
              type: 'NUMBER',
              description:
                'Sort within the same year; lower = newer (e.g. July before April). Required for correct homepage and credits ordering.',
            },
            videoUrl: { type: 'STRING' },
            image: { type: 'STRING' },
            imageFocus: {
              type: 'STRING',
              description:
                'CSS object-position for credit thumbnails when subject is off-center, e.g. "18% 40%"',
            },
            category: {
              type: 'STRING',
              description: 'Credit type: musical, play, cabaret, or film',
            },
          },
          required: ['title', 'year', 'synopsis'],
        },
      },
      {
        name: 'create_news_post',
        description: 'Create a news / press post.',
        parameters: {
          type: 'OBJECT',
          properties: {
            slug: { type: 'STRING' },
            title: { type: 'STRING' },
            date: { type: 'STRING', description: 'ISO date YYYY-MM-DD' },
            description: { type: 'STRING' },
            body: { type: 'STRING' },
            tags: { type: 'ARRAY', items: { type: 'STRING' } },
            image: { type: 'STRING' },
            videoUrl: { type: 'STRING' },
          },
          required: ['title', 'description', 'body'],
        },
      },
      {
        name: 'update_lessons_copy',
        description:
          'Update the Lessons page philosophy and details markdown at /lessons only. Private VOICE lessons (vocal pedagogy, vocal health, CCM). Never advertise acting, monologue, or scene-study lessons. Does not change rates or scheduling — use update_lesson_rates / update_lesson_scheduling for the book page.',
        parameters: {
          type: 'OBJECT',
          properties: {
            body: {
              type: 'STRING',
              description:
                'Markdown body for philosophy and teaching approach. Do not include dollar amounts or a rates section.',
            },
          },
          required: ['body'],
        },
      },
      {
        name: 'update_lessons_seo',
        description:
          'Update Lessons page title and/or meta description at /lessons. Does not change body copy or rates.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            description: { type: 'STRING' },
          },
        },
      },
      {
        name: 'update_lesson_rates',
        description:
          'Update lesson pricing on the book-a-lesson page at /lessons/book only. Provide both rates with ids 30min and 60min and numeric priceAmount. Always start from Lesson rates (live) in the catalog for any rate she does not change. Does not change lessons philosophy or scheduling copy.',
        parameters: {
          type: 'OBJECT',
          properties: {
            rates: {
              type: 'ARRAY',
              items: lessonRateSchema,
              description:
                'Full list of both session rates (30min and 60min), including unchanged live values',
            },
          },
          required: ['rates'],
        },
      },
      {
        name: 'update_lesson_scheduling',
        description:
          'Update format, scheduling instructions, and/or policy copy on /lessons/book. Does not change rates.',
        parameters: {
          type: 'OBJECT',
          properties: {
            format: {
              type: 'STRING',
              description: 'How lessons are offered, e.g. in-person NYC or Zoom',
            },
            scheduling: {
              type: 'STRING',
              description: 'How to inquire and what to include in an email',
            },
            body: {
              type: 'STRING',
              description: 'Optional markdown for the “What to expect” section',
            },
          },
        },
      },
      {
        name: 'update_lesson_book_seo',
        description:
          'Update book-a-lesson page title and/or meta description at /lessons/book. Does not change rates or body.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            description: { type: 'STRING' },
          },
        },
      },
      {
        name: 'add_gallery_photo',
        description:
          'Add a gallery entry referencing an already-uploaded image path. Do not invent captions — leave caption empty; the public gallery does not display captions. New photos always appear first in the gallery (sort order is automatic). Tags must be chosen only from the fixed allowlist (never invent new tags).',
        parameters: {
          type: 'OBJECT',
          properties: {
            slug: {
              type: 'STRING',
              description:
                'Optional markdown basename for src/content/gallery/<slug>.md — lowercase letters, numbers, and hyphens only. Omit .md (it is added automatically). Leave empty to derive from the image name.',
            },
            caption: {
              type: 'STRING',
              description: 'Optional; prefer empty string. Gallery UI does not show captions.',
            },
            image: { type: 'STRING', description: 'Path like /images/photos/foo.jpg or src path served as public' },
            tags: {
              type: 'ARRAY',
              items: {
                type: 'STRING',
                description: `One of: ${GALLERY_TAG_VALUES.join(', ')}`,
              },
              description: `Zero or more tags from the fixed allowlist only: ${GALLERY_TAG_VALUES.join(', ')}. Do not invent tags.`,
            },
            focus: {
              type: 'STRING',
              description:
                'CSS object-position for the gallery tile (e.g. "center", "50% 35%"). Defaults to center.',
            },
          },
          required: ['image'],
        },
      },
      {
        name: 'update_reel_url',
        description:
          'Update the casting reel YouTube (or video) URL and the video embed accessible title used on Materials, Shows, and home. Start from the live Reel URL / title in the catalog unless she provides replacements. Publishing downloads a still from the video into public/images/photos/reel-poster.jpg — do not invent a poster path or require a photo attachment. Do not change show credits or Materials page copy.',
        parameters: {
          type: 'OBJECT',
          properties: {
            reelUrl: { type: 'STRING', description: 'Full https URL to the reel video' },
            reelTitle: {
              type: 'STRING',
              description:
                'Accessible title for the video embed (Play button / iframe title). Start from Reel title (live) unless she gives a new title. Not the show credit title.',
            },
          },
          required: ['reelUrl'],
        },
      },
      {
        name: 'update_performer_facts',
        description:
          'Patch casting-facing performer facts (availability, vocal type/range, union, playing age, height, ethnicity). Read live Performer facts from the catalog; only set fields she wants changed — omit unchanged fields.',
        parameters: {
          type: 'OBJECT',
          properties: {
            availability: { type: 'STRING' },
            vocalType: { type: 'STRING' },
            vocalRange: { type: 'STRING' },
            union: { type: 'STRING' },
            playingAge: { type: 'STRING' },
            height: { type: 'STRING' },
            ethnicity: { type: 'STRING' },
          },
        },
      },
      {
        name: 'update_short_bio',
        description:
          'Update the short About lead bio only (one or two sentences). Start from the live Short bio in the catalog and revise it; do not invent a blank bio. Does not rewrite the full About page body.',
        parameters: {
          type: 'OBJECT',
          properties: {
            shortBio: {
              type: 'STRING',
              description: 'Short lead bio for the About page (max ~600 characters)',
            },
          },
          required: ['shortBio'],
        },
      },
      {
        name: 'update_press_quote',
        description:
          'Update the homepage press quote (quote text + attribution). Start from Press quote (live) in the catalog; send only fields she wants changed, or both. Shown under the hero on the home page.',
        parameters: {
          type: 'OBJECT',
          properties: {
            quote: {
              type: 'STRING',
              description: 'Quote text without surrounding quotation marks (max ~280 characters)',
            },
            attribution: {
              type: 'STRING',
              description: 'Attribution name or source (max ~120 characters)',
            },
          },
        },
      },
      {
        name: 'update_casting_fields',
        description:
          'Update frontmatter fields on an existing casting lander at /for/[slug] (keyword, title, description, related shows/skills, CTA). Reuse the existing page from the catalog; only send fields she wants changed. Does not create new pages or rewrite body copy. Do not invent post-body CTAs — Related credits is the last lander section before the shared footer.',
        parameters: {
          type: 'OBJECT',
          properties: {
            slug: { type: 'STRING', description: 'Existing casting page slug' },
            keyword: { type: 'STRING' },
            title: { type: 'STRING' },
            description: { type: 'STRING' },
            relatedSkills: { type: 'ARRAY', items: { type: 'STRING' } },
            relatedShows: { type: 'ARRAY', items: { type: 'STRING' } },
            cta: { type: 'STRING' },
          },
          required: ['slug'],
        },
      },
    ],
  },
];

function makeSlug(input, fallback) {
  const base = input || fallback || 'update';
  return slugify(base, { lower: true, strict: true });
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Resolve a rate row to a stable allowlisted id.
 * @param {{ id?: string, label?: string }} rate
 * @returns {'30min' | '60min' | null}
 */
function resolveLessonRateId(rate) {
  const rawId = String(rate?.id || '').trim();
  if (rawId === '30min' || rawId === '60min') return rawId;
  const label = String(rate?.label || '').toLowerCase();
  if (label.includes('30')) return '30min';
  if (label.includes('60')) return '60min';
  return null;
}

/**
 * Normalize lesson rates to allowlisted ids with required priceAmount.
 * @param {Array<{ id?: string, label?: string, price?: string, priceAmount?: number }>} rates
 * @returns {Array<{ id: string, label: string, price: string, priceAmount: number }>}
 */
export function normalizeLessonRates(rates) {
  /** @type {Map<string, { id: string, label: string, price: string, priceAmount: number }>} */
  const byId = new Map();

  for (const rate of rates || []) {
    const id = resolveLessonRateId(rate);
    if (!id || !LESSON_RATE_DEFS[id]) {
      throw new Error('Lesson rates only support 30-minute and 60-minute sessions.');
    }
    const def = LESSON_RATE_DEFS[id];
    const priceRaw = String(rate.price || '').trim();
    const parsedAmount = Number.parseFloat(priceRaw.replace(/[^0-9.]/g, ''));
    const priceAmount =
      typeof rate.priceAmount === 'number' && !Number.isNaN(rate.priceAmount)
        ? rate.priceAmount
        : parsedAmount;
    if (!Number.isFinite(priceAmount) || priceAmount <= 0) {
      throw new Error(`Rate ${id} needs a valid dollar amount.`);
    }
    const price = priceRaw.startsWith('$') ? priceRaw : `$${Math.round(priceAmount)}`;
    byId.set(id, {
      id,
      label: def.label,
      price,
      priceAmount,
    });
  }

  if (byId.size === 0) {
    throw new Error('update_lesson_rates requires at least one rate.');
  }

  const missing = LESSON_RATE_ID_VALUES.filter((id) => !byId.has(id));
  if (missing.length) {
    throw new Error(
      `Lesson rates must include both 30-minute and 60-minute sessions (missing: ${missing.join(', ')}).`,
    );
  }

  return LESSON_RATE_ID_VALUES.map((id) => byId.get(id));
}

/**
 * Merge frontmatter and/or body into an existing markdown page from GitHub.
 * @param {string} path
 * @param {{ data?: Record<string, unknown>, body?: string }} patch
 */
async function mergeMarkdownPage(path, { data = {}, body } = {}) {
  const existing = await readRepoTextFile(path);
  if (!existing) {
    throw new Error(`Missing content file: ${path}`);
  }
  const parsed = matter(existing);
  const mergedData = { ...parsed.data, ...data, updated: todayIsoDate() };
  const mergedBody = body !== undefined ? body : parsed.content;
  const normalizedBody = String(mergedBody || '').trim();
  return matter.stringify(normalizedBody ? `${normalizedBody}\n` : '', mergedData);
}

/**
 * @param {{ tool: string, path: string, content: string, commitMessage: string, summary: string, preview?: Record<string, unknown>, livePath?: string }} change
 */
function finalizeContentChange(change) {
  validateContentFile(change.path, change.content);
  return change;
}

/**
 * Kind-scoped publish allowlist (FLEX-P1-004).
 * @param {string} path
 * @returns {boolean}
 */
export function isAllowedContentPath(path) {
  const p = String(path || '').replace(/\\/g, '/');
  if (!p || p.includes('..') || p.startsWith('/')) return false;
  if (p === SITE_SETTINGS_PATH) return true;
  if (p.startsWith('public/images/photos/')) return true;
  if (/^src\/content\/shows\/[^/]+\.md$/.test(p)) return true;
  if (/^src\/content\/news\/[^/]+\.md$/.test(p)) return true;
  if (/^src\/content\/gallery\/[^/]+\.md$/.test(p)) return true;
  if (p === LESSONS_PAGE || p === LESSONS_BOOK_PAGE) return true;
  if (/^src\/content\/casting\/[^/]+\.md$/.test(p)) return true;
  return false;
}

/**
 * SHA-256 hex of the raw committed image (never a derived variant).
 * @param {unknown} raw
 * @returns {string | undefined}
 */
export function normalizeContentHash(raw) {
  const hash = String(raw || '')
    .trim()
    .toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : undefined;
}

/**
 * Build a proposed file change from a Gemini tool call (no GitHub write).
 * @param {string} name
 * @param {Record<string, unknown>} args
 * @param {string} [photoPath]
 * @param {{ originalContentHash?: string }} [options]
 * @returns {Promise<{ tool: string, path: string, content: string, commitMessage: string, summary: string, preview?: Record<string, unknown>, livePath?: string }>}
 */
export async function buildContentChange(name, args, photoPath, options = {}) {
  const today = todayIsoDate();
  /** @type {{ tool: string, path: string, content: string, commitMessage: string, summary: string, preview?: Record<string, unknown>, livePath?: string }} */
  let change;

  switch (name) {
    case 'upsert_show': {
      const slug = makeSlug(args.slug || args.title);
      const content =
        toFrontmatter({
          title: args.title,
          year: args.year,
          role: args.role,
          venue: args.venue,
          synopsis: args.synopsis,
          featured: Boolean(args.featured),
          order: args.order,
          videoUrl: args.videoUrl,
          image: args.image || photoPath,
          imageFocus: args.imageFocus,
          category: args.category || undefined,
        }) +
        (args.body || args.synopsis) +
        '\n';
      change = {
        tool: name,
        path: `src/content/shows/${slug}.md`,
        content,
        commitMessage: `studio: upsert_show ${slug}.md`,
        summary: `Updated show “${args.title}” at /shows.`,
        livePath: '/shows',
        commitParams: {
          title: args.title,
          year: args.year,
          role: args.role,
          venue: args.venue,
          featured: Boolean(args.featured),
          category: args.category || undefined,
          image: args.image || photoPath,
          imageFocus: args.imageFocus,
        },
      };
      break;
    }
    case 'create_news_post': {
      const slug = makeSlug(args.slug || args.title);
      const content =
        toFrontmatter({
          title: args.title,
          date: args.date || today,
          description: args.description,
          tags: args.tags || [],
          image: args.image || photoPath,
          videoUrl: args.videoUrl,
        }) +
        args.body +
        '\n';
      change = {
        tool: name,
        path: `src/content/news/${slug}.md`,
        content,
        commitMessage: `studio: create_news_post ${slug}.md`,
        summary: `Published news post “${args.title}” at /news/${slug}.`,
        livePath: `/news/${slug}`,
        commitParams: {
          title: args.title,
          date: args.date || today,
          description: args.description,
          tags: args.tags || [],
          image: args.image || photoPath,
        },
      };
      break;
    }
    case 'update_lessons_copy': {
      const content = await mergeMarkdownPage(LESSONS_PAGE, { body: args.body });
      change = {
        tool: name,
        path: LESSONS_PAGE,
        content,
        commitMessage: 'studio: update_lessons_copy lessons.md',
        summary: 'Updated lessons philosophy and details at /lessons.',
        livePath: '/lessons',
        commitParams: { path: LESSONS_PAGE },
      };
      break;
    }
    case 'update_lessons_seo': {
      const data = {};
      if (args.title) data.title = args.title;
      if (args.description) data.description = args.description;
      if (!Object.keys(data).length) {
        throw new Error('update_lessons_seo requires title and/or description.');
      }
      const content = await mergeMarkdownPage(LESSONS_PAGE, { data });
      change = {
        tool: name,
        path: LESSONS_PAGE,
        content,
        commitMessage: 'studio: update_lessons_seo lessons.md',
        summary: 'Updated Lessons page title/description.',
        livePath: '/lessons',
        commitParams: {
          title: args.title,
          description: args.description,
        },
      };
      break;
    }
    case 'update_lesson_rates': {
      const rates = normalizeLessonRates(args.rates);
      const content = await mergeMarkdownPage(LESSONS_BOOK_PAGE, { data: { rates } });
      change = {
        tool: name,
        path: LESSONS_BOOK_PAGE,
        content,
        commitMessage: 'studio: update_lesson_rates lessons-book.md',
        summary: 'Updated lesson rates at /lessons/book.',
        livePath: '/lessons/book',
        commitParams: {
          rates: formatRatesParam(rates),
        },
        preview: {
          kind: 'rates',
          rates: rates.map((r) => ({
            id: r.id,
            label: r.label,
            price: r.price,
            priceAmount: r.priceAmount,
          })),
        },
      };
      break;
    }
    case 'update_lesson_scheduling': {
      const data = {};
      if (args.format) data.format = args.format;
      if (args.scheduling) data.scheduling = args.scheduling;
      const patch = { data };
      if (args.body !== undefined) patch.body = args.body;
      if (!Object.keys(data).length && args.body === undefined) {
        throw new Error('update_lesson_scheduling requires format, scheduling, and/or body.');
      }
      const content = await mergeMarkdownPage(LESSONS_BOOK_PAGE, patch);
      change = {
        tool: name,
        path: LESSONS_BOOK_PAGE,
        content,
        commitMessage: 'studio: update_lesson_scheduling lessons-book.md',
        summary: 'Updated lesson scheduling details at /lessons/book.',
        livePath: '/lessons/book',
        commitParams: {
          format: args.format,
          scheduling: args.scheduling,
        },
      };
      break;
    }
    case 'update_lesson_book_seo': {
      const data = {};
      if (args.title) data.title = args.title;
      if (args.description) data.description = args.description;
      if (!Object.keys(data).length) {
        throw new Error('update_lesson_book_seo requires title and/or description.');
      }
      const content = await mergeMarkdownPage(LESSONS_BOOK_PAGE, { data });
      change = {
        tool: name,
        path: LESSONS_BOOK_PAGE,
        content,
        commitMessage: 'studio: update_lesson_book_seo lessons-book.md',
        summary: 'Updated book-a-lesson page title/description.',
        livePath: '/lessons/book',
        commitParams: {
          title: args.title,
          description: args.description,
        },
      };
      break;
    }
    case 'add_gallery_photo': {
      const image = args.image || photoPath;
      if (!image) throw new Error('Gallery photo requires an image path or upload.');

      const slugRaw = args.slug != null && String(args.slug).trim() ? String(args.slug).trim() : '';
      let slug;
      if (slugRaw) {
        const slugCheck = validateGallerySlug(slugRaw);
        if (!slugCheck.ok) {
          throw new StudioContentValidationError(
            slugCheck.error || 'Gallery filename is invalid.',
            { path: 'src/content/gallery/' },
          );
        }
        slug = slugCheck.slug;
      } else {
        slug = makeSlug(
          String(image)
            .split('/')
            .pop()
            ?.replace(/\.[^.]+$/, '') || 'gallery-photo',
        );
      }
      if (!slug) {
        throw new StudioContentValidationError('Gallery filename could not be derived.', {
          path: 'src/content/gallery/',
        });
      }

      const { tags } = normalizeGalleryTags(args.tags);
      // Newest first on /gallery (ascending sort). Ignore any client-supplied order.
      const order = -Date.now();
      const focus = String(args.focus || '').trim() || undefined;
      const contentHash = normalizeContentHash(
        options.originalContentHash || args.contentHash,
      );
      const content =
        toFrontmatter({
          image,
          contentHash,
          tags: tags.length ? tags : undefined,
          order,
          focus,
        }) + '\n';
      change = {
        tool: name,
        path: `src/content/gallery/${slug}.md`,
        content,
        commitMessage: `studio: add_gallery_photo ${slug}.md`,
        summary: `Added gallery photo (${slug}).`,
        livePath: '/gallery',
        commitParams: {
          slug,
          image,
          tags,
          focus: focus || 'center',
        },
        preview: {
          kind: 'gallery',
          slug,
          image,
          tags,
          focus: focus || 'center',
        },
      };
      break;
    }
    case 'update_reel_url': {
      const reelUrl = String(args.reelUrl || '').trim();
      if (!reelUrl) throw new Error('update_reel_url requires reelUrl.');
      const patch = { reelUrl };
      if (args.reelTitle != null && String(args.reelTitle).trim()) {
        patch.reelTitle = String(args.reelTitle).trim();
      }
      const merged = await mergeSiteSettings(patch);
      change = {
        tool: name,
        path: merged.path,
        content: merged.content,
        commitMessage: 'studio: update_reel_url site-settings.json',
        summary: 'Updated the casting reel link, embed title, and poster on Materials and related pages.',
        livePath: '/materials',
        commitParams: {
          reelUrl: merged.data.reelUrl,
          reelTitle: merged.data.reelTitle,
        },
        preview: {
          kind: 'reel',
          reelUrl: merged.data.reelUrl,
          reelTitle: merged.data.reelTitle,
        },
      };
      break;
    }
    case 'update_performer_facts': {
      /** @type {Record<string, string>} */
      const performer = {};
      for (const key of PERFORMER_FACT_KEYS) {
        if (args[key] != null && String(args[key]).trim()) {
          performer[key] = String(args[key]).trim();
        }
      }
      if (!Object.keys(performer).length) {
        throw new Error('update_performer_facts requires at least one fact field.');
      }
      const merged = await mergeSiteSettings({ performer });
      change = {
        tool: name,
        path: merged.path,
        content: merged.content,
        commitMessage: 'studio: update_performer_facts site-settings.json',
        summary: 'Updated performer facts on About and Materials.',
        livePath: '/materials',
        commitParams: {
          patchedKeys: Object.keys(performer),
          ...Object.fromEntries(
            Object.entries(performer).map(([k, v]) => [`performer.${k}`, v]),
          ),
        },
        preview: {
          kind: 'performer',
          performer: merged.data.performer,
          patchedKeys: Object.keys(performer),
        },
      };
      break;
    }
    case 'update_short_bio': {
      const shortBio = String(args.shortBio || '').trim();
      if (!shortBio) throw new Error('update_short_bio requires shortBio.');
      const merged = await mergeSiteSettings({ shortBio });
      change = {
        tool: name,
        path: merged.path,
        content: merged.content,
        commitMessage: 'studio: update_short_bio site-settings.json',
        summary: 'Updated the short bio on the About page.',
        livePath: '/about',
        commitParams: { shortBio: merged.data.shortBio },
        preview: { kind: 'shortBio', shortBio: merged.data.shortBio },
      };
      break;
    }
    case 'update_press_quote': {
      const pressQuote = {};
      if (args.quote != null && String(args.quote).trim()) {
        pressQuote.quote = String(args.quote).trim();
      }
      if (args.attribution != null && String(args.attribution).trim()) {
        pressQuote.attribution = String(args.attribution).trim();
      }
      if (!Object.keys(pressQuote).length) {
        throw new Error('update_press_quote requires quote and/or attribution.');
      }
      const merged = await mergeSiteSettings({ pressQuote });
      change = {
        tool: name,
        path: merged.path,
        content: merged.content,
        commitMessage: 'studio: update_press_quote site-settings.json',
        summary: 'Updated the homepage press quote.',
        livePath: '/',
        commitParams: {
          quote: merged.data.pressQuote.quote,
          attribution: merged.data.pressQuote.attribution,
        },
        preview: {
          kind: 'pressQuote',
          quote: merged.data.pressQuote.quote,
          attribution: merged.data.pressQuote.attribution,
        },
      };
      break;
    }
    case 'update_casting_fields': {
      const slug = makeSlug(args.slug);
      if (!slug) throw new Error('update_casting_fields requires an existing casting slug.');
      const path = `src/content/casting/${slug}.md`;
      const existing = await readRepoTextFile(path);
      if (!existing) {
        throw new Error(
          `Casting page “${slug}” does not exist yet. New casting pages are added by hand (see the casting runbook).`,
        );
      }
      const data = {};
      for (const key of ['keyword', 'title', 'description', 'cta']) {
        if (args[key] != null && String(args[key]).trim()) data[key] = String(args[key]).trim();
      }
      if (Array.isArray(args.relatedShows)) data.relatedShows = args.relatedShows;
      if (Array.isArray(args.relatedSkills)) data.relatedSkills = args.relatedSkills;
      if (!Object.keys(data).length) {
        throw new Error('update_casting_fields requires at least one field to update.');
      }
      const content = await mergeMarkdownPage(path, { data });
      const parsed = matter(content);
      change = {
        tool: name,
        path,
        content,
        commitMessage: `studio: update_casting_fields ${slug}.md`,
        summary: `Updated casting page fields at /for/${slug}.`,
        livePath: `/for/${slug}`,
        commitParams: {
          slug,
          keyword: parsed.data.keyword,
          title: parsed.data.title,
          description: parsed.data.description,
          cta: parsed.data.cta,
          relatedShows: parsed.data.relatedShows || [],
          relatedSkills: parsed.data.relatedSkills || [],
        },
        preview: {
          kind: 'casting',
          slug,
          keyword: parsed.data.keyword,
          title: parsed.data.title,
          description: parsed.data.description,
          cta: parsed.data.cta,
          relatedShows: parsed.data.relatedShows || [],
          relatedSkills: parsed.data.relatedSkills || [],
        },
      };
      break;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return finalizeContentChange(change);
}

/**
 * Map a repo content path to a public site URL path (or null if not a page).
 * @param {string} path
 * @returns {string | null}
 */
export function publicUrlForContentPath(path) {
  const p = String(path || '').replace(/\\/g, '/');
  let m;
  if ((m = /^src\/content\/news\/([^/]+)\.md$/.exec(p))) return `/news/${m[1]}`;
  if (/^src\/content\/shows\/[^/]+\.md$/.test(p)) return '/shows';
  if (p === 'src/content/pages/about.md') return '/about';
  if (p === LESSONS_PAGE) return '/lessons';
  if (p === LESSONS_BOOK_PAGE) return '/lessons/book';
  if (/^src\/content\/gallery\/[^/]+\.md$/.test(p)) return '/gallery';
  if ((m = /^src\/content\/casting\/([^/]+)\.md$/.exec(p))) return `/for/${m[1]}`;
  if (p === SITE_SETTINGS_PATH) return '/materials';
  if ((m = /^public\/(images\/photos\/[^/]+)$/.exec(p))) return `/${m[1]}`;
  return null;
}

/**
 * Format a commit-message param value for the commit body.
 * @param {unknown} value
 * @returns {string}
 */
function formatCommitParamValue(value) {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (text.length > 120) return `${text.slice(0, 117)}...`;
  return text;
}

/**
 * Summarize lesson rates for a commit message body.
 * @param {unknown} rates
 */
function formatRatesParam(rates) {
  if (!Array.isArray(rates)) return '';
  return rates
    .map((r) => {
      if (!r || typeof r !== 'object') return '';
      const id = String(/** @type {{ id?: string }} */ (r).id || '').trim();
      const price =
        /** @type {{ price?: string, priceAmount?: number }} */ (r).price ||
        (/** @type {{ priceAmount?: number }} */ (r).priceAmount != null
          ? `$${/** @type {{ priceAmount?: number }} */ (r).priceAmount}`
          : '');
      if (!id) return '';
      return price ? `${id}=${price}` : id;
    })
    .filter(Boolean)
    .join('; ');
}

/**
 * Pull configuration params from a change (explicit params, preview, or file content).
 * @param {{
 *   tool?: string,
 *   path?: string,
 *   content?: string,
 *   commitParams?: Record<string, unknown>,
 *   preview?: Record<string, unknown>,
 * }} change
 * @returns {Record<string, string>}
 */
export function extractCommitParams(change) {
  /** @type {Record<string, string>} */
  const out = {};
  const put = (key, value) => {
    const formatted = formatCommitParamValue(value);
    if (!formatted) return;
    out[key] = formatted;
  };

  const explicit =
    change.commitParams && typeof change.commitParams === 'object' ? change.commitParams : null;
  if (explicit) {
    for (const [key, value] of Object.entries(explicit)) {
      if (key === 'kind' || key === 'order') continue;
      put(key, value);
    }
  }

  const preview = change.preview && typeof change.preview === 'object' ? change.preview : null;
  if (preview) {
    for (const [key, value] of Object.entries(preview)) {
      if (key === 'kind' || key === 'order' || out[key]) continue;
      if (key === 'rates') {
        put('rates', formatRatesParam(value));
        continue;
      }
      if (key === 'patchedKeys' && Array.isArray(value)) {
        put('patchedKeys', value);
        continue;
      }
      put(key, value);
    }
  }

  const path = String(change.path || '').replace(/\\/g, '/');
  const content = String(change.content ?? '');
  const tool = String(change.tool || '');

  if (path.endsWith('.md') && content.includes('---')) {
    try {
      const { data } = matter(content);
      const fm = data && typeof data === 'object' ? data : {};
      const keysByTool = {
        upsert_show: [
          'title',
          'year',
          'role',
          'venue',
          'featured',
          'category',
          'image',
          'imageFocus',
          'videoUrl',
        ],
        create_news_post: ['title', 'date', 'description', 'tags', 'image', 'videoUrl'],
        add_gallery_photo: ['image', 'tags', 'focus'],
        update_lessons_seo: ['title', 'description'],
        update_lesson_rates: ['rates'],
        update_lesson_scheduling: ['format', 'scheduling'],
        update_lesson_book_seo: ['title', 'description'],
        update_casting_fields: [
          'keyword',
          'title',
          'description',
          'cta',
          'relatedShows',
          'relatedSkills',
        ],
      };
      const keys =
        keysByTool[tool] ||
        [
          'title',
          'year',
          'role',
          'venue',
          'date',
          'tags',
          'image',
          'focus',
          'imageFocus',
          'keyword',
          'featured',
          'category',
          'format',
          'scheduling',
          'rates',
          'description',
          'cta',
        ];
      for (const key of keys) {
        if (out[key] || fm[key] == null || fm[key] === '') continue;
        if (key === 'rates') {
          put('rates', formatRatesParam(fm[key]));
          continue;
        }
        put(key, fm[key]);
      }
    } catch {
      // Ignore frontmatter parse errors; subject/paths still land in the commit.
    }
  }

  if (path === SITE_SETTINGS_PATH || path.endsWith('site-settings.json')) {
    try {
      const data = JSON.parse(content);
      if (tool === 'update_reel_url' || data.reelUrl) put('reelUrl', data.reelUrl);
      if (tool === 'update_reel_url' || data.reelTitle) put('reelTitle', data.reelTitle);
      if (tool === 'update_short_bio' || data.shortBio) put('shortBio', data.shortBio);
      if (tool === 'update_press_quote' || data.pressQuote) {
        if (data.pressQuote?.quote) put('quote', data.pressQuote.quote);
        if (data.pressQuote?.attribution) put('attribution', data.pressQuote.attribution);
      }
      if (tool === 'update_performer_facts' || data.performer) {
        const performer = data.performer && typeof data.performer === 'object' ? data.performer : {};
        for (const key of PERFORMER_FACT_KEYS) {
          if (performer[key]) put(`performer.${key}`, performer[key]);
        }
      }
    } catch {
      // ignore
    }
  }

  return out;
}

/**
 * Build one commit message for a multi-file Studio publish.
 * Subject stays scannable in `git log --oneline`; body lists paths + config params.
 *
 * @param {Array<{
 *   path?: string,
 *   content?: string,
 *   commitMessage?: string,
 *   message?: string,
 *   tool?: string,
 *   commitParams?: Record<string, unknown>,
 *   preview?: Record<string, unknown>,
 * }>} changes
 * @param {Array<{ path?: string }>} [extraFiles]
 */
export function buildPublishCommitMessage(changes, extraFiles = []) {
  const list = Array.isArray(changes) ? changes : [];
  const media = Array.isArray(extraFiles) ? extraFiles : [];
  const tools = [
    ...new Set(list.map((c) => String(c.tool || '').trim()).filter(Boolean)),
  ];
  const contentPaths = list
    .map((c) => String(c.path || '').replace(/\\/g, '/'))
    .filter(Boolean);
  const mediaPaths = media
    .map((f) => String(f.path || '').replace(/\\/g, '/'))
    .filter(Boolean);
  const allPaths = [...new Set([...contentPaths, ...mediaPaths])];

  const toolLabel =
    tools.length === 1 ? tools[0] : tools.length > 1 ? tools.join('+') : 'publish';
  const primary =
    contentPaths[0]?.split('/').pop() || mediaPaths[0]?.split('/').pop() || 'update';
  let subject = `studio: ${toolLabel} ${primary}`;
  if (mediaPaths.length > 0) subject += ' (+image)';
  // Prefer a dedicated subject from the first change when it already looks Studio-shaped.
  const legacy = String(list[0]?.commitMessage || list[0]?.message || '').trim();
  if (legacy.startsWith('studio:') && list.length === 1 && mediaPaths.length === 0) {
    subject = legacy.split('\n')[0].trim() || subject;
  }
  if (subject.length > 90) subject = `${subject.slice(0, 87)}...`;

  const lines = [subject, ''];
  lines.push(`Tool: ${tools.length ? tools.join(', ') : 'publish'}`);
  lines.push('Paths:');
  if (allPaths.length === 0) {
    lines.push('- (none)');
  } else {
    for (const p of allPaths) lines.push(`- ${p}`);
  }

  if (list.length <= 1) {
    const params = extractCommitParams(list[0] || {});
    const entries = Object.entries(params);
    if (entries.length) {
      lines.push('', 'Params:');
      for (const [key, value] of entries) lines.push(`- ${key}: ${value}`);
    }
  } else {
    for (const change of list) {
      const params = extractCommitParams(change);
      const entries = Object.entries(params);
      if (!entries.length) continue;
      const label = String(change.path || change.tool || 'change');
      lines.push('', `Params (${label}):`);
      for (const [key, value] of entries) lines.push(`- ${key}: ${value}`);
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

/**
 * Commit approved content changes (and optional media) to GitHub in **one** commit.
 * @param {Array<{ path: string, content: string, commitMessage?: string, message?: string, tool?: string, summary?: string }>} changes
 * @param {{
 *   branch?: string,
 *   publishMode?: 'pr'|'direct',
 *   extraFiles?: Array<{ path: string, content: string | Buffer, binary?: boolean }>,
 * }} [opts]
 */
export async function applyContentChanges(changes, opts = {}) {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new Error('No content changes to publish.');
  }

  const branch = opts.branch || undefined;
  const publishMode = opts.publishMode || 'direct';
  const extraFiles = Array.isArray(opts.extraFiles) ? opts.extraFiles : [];
  /** @type {Array<{ path: string, content: string | Buffer, binary?: boolean }>} */
  const files = [];
  const actions = [];

  for (const change of changes) {
    const path = String(change.path || '').replace(/\\/g, '/');
    if (!isAllowedContentPath(path)) {
      throw new Error(`Disallowed content path: ${path}`);
    }
    const content = String(change.content ?? '');
    validateContentFile(path, content);
    files.push({ path, content, binary: false });
    const summary = change.summary || `Updated ${path}.`;
    trackEvent('StudioToolExecuted', { tool: change.tool || 'publish' });
    actions.push({
      tool: change.tool || 'publish',
      summary,
      path,
      url: publicUrlForContentPath(path),
    });
  }

  for (const media of extraFiles) {
    const path = String(media.path || '').replace(/\\/g, '/');
    if (!isAllowedContentPath(path)) {
      throw new Error(`Disallowed media path: ${path}`);
    }
    files.push({
      path,
      content: media.content,
      binary: media.binary !== false,
    });
  }

  const commitMessage = buildPublishCommitMessage(changes, extraFiles);
  const committed = await commitFiles({ files, message: commitMessage, branch });
  const commitSha = committed.commitSha || undefined;
  for (const action of actions) {
    action.commitSha = commitSha;
  }

  const summaryText = actions.map((a) => a.summary).join(' ');
  const reply =
    publishMode === 'pr'
      ? `${summaryText} Saved on a staging branch — not live on production until the pull request is merged. Use Actions → CD: staging to test on the staging site.`
      : `${summaryText} The site will rebuild and go live within a few minutes.`;

  return { reply, actions, commitSha };
}

const CONTENT_DIRS = [
  'src/content/shows',
  'src/content/news',
  'src/content/pages',
  'src/content/gallery',
  'src/content/casting',
];

/**
 * Production site URL used as the canonical reference for Gemini.
 * Prefer SITE_URL; fall back to PUBLIC_SITE_URL; default to the live domain.
 */
export function productionSiteUrl() {
  const raw = process.env.SITE_URL || process.env.PUBLIC_SITE_URL || 'https://elysetindall.com';
  return String(raw).replace(/\/$/, '');
}

function frontmatterField(text, key) {
  const re = new RegExp(`^${key}:\\s*(.*)$`, 'm');
  const m = String(text || '').match(re);
  if (!m) return '';
  return m[1].trim().replace(/^["']|["']$/g, '');
}

/**
 * Read live lesson rates for Studio Quick edit / catalog (non-fatal on failure).
 * @returns {Promise<Array<{ id: string, label: string, priceAmount: number }> | null>}
 */
export async function readLiveLessonRates() {
  try {
    const text = await readRepoTextFile(LESSONS_BOOK_PAGE);
    if (!text) return null;
    const parsed = matter(text);
    const rates = normalizeLessonRates(parsed.data?.rates || []);
    return rates.map((r) => ({ id: r.id, label: r.label, priceAmount: r.priceAmount }));
  } catch {
    return null;
  }
}

/**
 * Build a compact catalog of live portfolio pages from the GitHub content branch.
 * Failures are non-fatal — Studio can still draft without the catalog.
 * @returns {Promise<string>}
 */
export async function buildProductionSiteContext() {
  const siteUrl = productionSiteUrl();
  const lines = [
    `Production site (canonical reference): ${siteUrl}`,
    'Site map: / (home), /shows, /materials, /about, /lessons, /lessons/book, /news, /gallery, /contact, /for/[slug] (casting). Primary nav: Shows, Materials, Lessons, About, News, Contact (Gallery via About/footer; no public phone).',
    'Teaching brand: private VOICE lessons only (vocal pedagogy, vocal health, CCM) — not acting lessons.',
    'Existing content on the production branch (reuse slugs when updating; match voice and facts):',
  ];

  try {
    const pathLists = await Promise.all(CONTENT_DIRS.map((dir) => listRepoFiles(dir)));
    const paths = pathLists
      .flat()
      .filter((p) => p.endsWith('.md'))
      .sort();

    if (!paths.length) {
      lines.push('- (no markdown content found yet)');
    } else {
      const entries = await Promise.all(
        paths.map(async (path) => {
          const text = await readRepoTextFile(path);
          const urlPath = publicUrlForContentPath(path);
          const liveUrl = urlPath ? `${siteUrl}${urlPath}` : null;
          const label =
            frontmatterField(text, 'title') ||
            frontmatterField(text, 'keyword') ||
            frontmatterField(text, 'caption') ||
            path.split('/').pop()?.replace(/\.md$/, '') ||
            path;
          return liveUrl ? `- ${label} — ${liveUrl} (${path})` : `- ${label} — ${path}`;
        }),
      );
      lines.push(...entries);
    }
  } catch {
    lines.push(
      `- Catalog unavailable; still treat ${siteUrl} as the live site and avoid inventing credits.`,
    );
  }

  try {
    const rates = await readLiveLessonRates();
    if (rates?.length) {
      lines.push(
        `Lesson rates (live): ${rates.map((r) => `${r.id} $${r.priceAmount}`).join('; ')}`,
      );
    }
  } catch {
    /* non-fatal */
  }

  try {
    const settings = await readSiteSettings();
    lines.push(`Reel URL (live): ${settings.reelUrl}`);
    lines.push(`Reel title (live): ${settings.reelTitle}`);
    lines.push(`Short bio (live): ${settings.shortBio}`);
    lines.push(
      `Press quote (live): “${settings.pressQuote.quote}” — ${settings.pressQuote.attribution}`,
    );
    const p = settings.performer;
    lines.push(
      `Performer facts (live): availability=${p.availability}; vocalType=${p.vocalType}; vocalRange=${p.vocalRange}; union=${p.union}` +
        (p.playingAge ? `; playingAge=${p.playingAge}` : '') +
        (p.height ? `; height=${p.height}` : '') +
        (p.ethnicity ? `; ethnicity=${p.ethnicity}` : ''),
    );
  } catch {
    /* non-fatal */
  }

  return lines.join('\n');
}

/**
 * Ask Gemini for tool calls and return proposed file changes (no commits).
 * @param {{ message: string, photoPath?: string, originalContentHash?: string }} opts
 */
export async function runContentAgent({ message, photoPath, originalContentHash }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

  const siteUrl = productionSiteUrl();
  const siteContext = await buildProductionSiteContext();

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    tools,
    systemInstruction: `You are a warm, highly capable digital manager for Elyse Tindall, a NYC-based musical theatre actress, singer, and vocal coach (Atlanta to New York).
Turn her natural-language requests into the appropriate tool call to update her Astro portfolio at ${siteUrl}.
Each request includes a production site catalog (live URLs + repo paths). Use it so updates build on what already exists instead of inventing a blank site.

Brand facts (always honor these):
- She is a PERFORMER (musical theatre actress/singer) and a VOCAL COACH only for teaching.
- Private lessons are voice lessons: vocal pedagogy, vocal health, and contemporary commercial music (CCM).
- Do NOT advertise acting lessons, monologue coaching, scene study, or “acting through song” as lesson offerings.
- Audition song / repertoire prep is fine when framed as singing and vocal preparation—not acting class.
- On about/casting copy she may discuss acting craft as a performer; that must not become lesson marketing.

Rules:
- Prefer upsert_show for new bookings/credits; when updating an existing show, reuse its slug from the catalog. Set featured true only for headline credits — the homepage auto-shows the three most recent featured shows by year, then order (lower order = newer within a year).
- For show venue, always use "[Theater Name] - [City], [ST]" (examples: "Alliance Theatre - Atlanta, GA", "Georgia State University - Atlanta, GA"). Highlight only the theater/company and city/state. Put room names, galleries, festival/program tags, co-producers, and similar context in synopsis or body — never cram them into venue.
- Prefer create_news_post for press and announcements.
- Prefer update_casting_fields when she asks to change CTA, title, description, keyword, or related shows/skills on an existing /for/… casting page. Reuse the existing slug from the catalog. Do not create new casting pages — those are added by hand outside Studio. Casting landers end at the Related credits block in LandingLayout — never add CTAs, casting-index links, Materials links, or other content below Related credits (footer already has Materials / Contact / Lessons).
- Prefer update_short_bio when she wants a short About lead update. Do not rewrite the full About page body (that is PR-only). Start from Short bio (live) in the catalog.
- Prefer update_press_quote when she wants to change the homepage press quote or its attribution. Start from Press quote (live) in the catalog; send only fields she changes.
- Prefer update_performer_facts when she asks to change availability, vocal range/type, union, playing age, height, or ethnicity. Read Performer facts (live) first; only send fields she wants changed.
- Prefer update_reel_url when she wants to change the casting reel link or the video embed title. Start from Reel URL / title (live) unless she gives replacements. The site refreshes the reel poster still from the video; do not invent a poster path. Do not rewrite show credits or Materials page copy.
- Prefer update_lessons_copy when she asks to change lessons philosophy, approach, or teaching details at ${siteUrl}/lessons. Never include dollar amounts or rates in that copy.
- Prefer update_lessons_seo only when she explicitly wants to change the Lessons page title or search description.
- Prefer update_lesson_rates when she asks to change lesson prices or session rates. This updates ${siteUrl}/lessons/book only — always provide both rates with ids 30min and 60min and numeric priceAmount (use Lesson rates (live) from the catalog for any rate she does not change).
- Discrete field rule (rates, reel, short bio, press quote, performer facts, casting field merges): always ground the tool call in the live values from the catalog. Never blank out a discrete field or invent a parallel value when the catalog already shows the current one. For partial changes, keep unchanged live values (rates: include both tiers; short bio/reel: revise the live string; press quote: omit keys she did not mention; performer facts: omit keys she did not mention).
- Prefer update_lesson_scheduling when she asks about lesson format (NYC/Zoom), how to book, scheduling, or what students should expect on the book page.
- Prefer update_lesson_book_seo only when she explicitly wants to change the book-a-lesson page title or search description.
- Never use lessons tools to change show credits, news, or gallery content.
- When drafting lessons copy, keep it vocal-coach accurate (pedagogy, vocal health, CCM); never add acting-lesson offerings.
- Prefer add_gallery_photo when she attaches a photo for the gallery (image path will be provided). Leave caption empty — the public gallery does not display captions. Do not set sort order; new photos always appear first. Tags must be from the fixed allowlist only (${GALLERY_TAG_VALUES.join(', ')}) — never invent new tags.
- Keep tone professional, warm, and accurate. Do not invent fake credits; align facts with the catalog and production site.
- Content is expected to be evergreen unless otherwise specified. Avoid relative terms like today, this week, this month, etc which would not make sense in the future.
- Never mention technical terms like "YAML," "Azure," or "Astro" to her—keep her user experience purely creative and effortless.
- Always call a tool when an update is requested; do not only chat.`,
  });

  const promptParts = [
    siteContext,
    '',
    `Publisher request: ${message}`,
  ];
  if (photoPath) {
    promptParts.push('', `[Attached photo will be available at path: ${photoPath}]`);
  }
  const prompt = promptParts.join('\n');

  const result = await model.generateContent(prompt);
  const response = result.response;
  const calls = response.functionCalls?.() || [];

  // Fallback for SDK shape differences
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const functionCalls =
    calls.length > 0
      ? calls
      : parts
          .filter((p) => p.functionCall)
          .map((p) => ({ name: p.functionCall.name, args: p.functionCall.args }));

  if (!functionCalls.length) {
    const text =
      response.text?.() || 'I could not map that to a website update. Try being more specific.';
    return { reply: text, changes: [], actions: [] };
  }

  const changes = [];
  for (const call of functionCalls) {
    const change = await buildContentChange(call.name, call.args || {}, photoPath, {
      originalContentHash,
    });
    trackEvent('StudioToolExecuted', { tool: call.name, mode: 'draft' });
    changes.push(change);
  }

  const reply = changes.map((c) => c.summary).join(' ');
  return {
    reply,
    changes,
    actions: changes.map((c) => ({ tool: c.tool, summary: c.summary })),
  };
}
