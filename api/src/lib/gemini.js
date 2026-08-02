import { GoogleGenerativeAI } from '@google/generative-ai';
import matter from 'gray-matter';
import { trackEvent } from './telemetry.js';
import slugify from 'slugify';
import { commitFile, listRepoFiles, readRepoTextFile, toFrontmatter } from './github.js';
import { validateContentFile } from './contentValidate.js';

const LESSONS_PAGE = 'src/content/pages/lessons.md';
const LESSONS_BOOK_PAGE = 'src/content/pages/lessons-book.md';

const lessonRateSchema = {
  type: 'OBJECT',
  properties: {
    label: { type: 'STRING', description: 'Session label, e.g. 30-minute session' },
    price: { type: 'STRING', description: 'Display price, e.g. $60' },
    priceAmount: { type: 'NUMBER', description: 'Numeric USD amount for structured data, e.g. 60' },
  },
  required: ['label', 'price'],
};

const tools = [
  {
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
            venue: { type: 'STRING' },
            synopsis: { type: 'STRING' },
            body: { type: 'STRING', description: 'Longer markdown body' },
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
        name: 'update_about',
        description:
          'Replace the About page markdown (background + philosophy). She is an actress/singer and vocal coach; if teaching is mentioned, frame it as private voice lessons (pedagogy, vocal health, CCM), not acting lessons.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            description: { type: 'STRING' },
            body: { type: 'STRING', description: 'Full markdown body including ## headings' },
          },
          required: ['body'],
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
          'Update lesson pricing on the book-a-lesson page at /lessons/book only. Does not change lessons philosophy or scheduling copy.',
        parameters: {
          type: 'OBJECT',
          properties: {
            rates: {
              type: 'ARRAY',
              items: lessonRateSchema,
              description: 'Full list of session rates to display',
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
          'Add a gallery entry referencing an already-uploaded image path. Do not invent captions — leave caption empty; the public gallery does not display captions.',
        parameters: {
          type: 'OBJECT',
          properties: {
            slug: { type: 'STRING', description: 'URL-safe id for the markdown filename' },
            caption: {
              type: 'STRING',
              description: 'Optional; prefer empty string. Gallery UI does not show captions.',
            },
            image: { type: 'STRING', description: 'Path like /images/photos/foo.jpg or src path served as public' },
            tags: { type: 'ARRAY', items: { type: 'STRING' } },
            order: { type: 'NUMBER' },
          },
          required: ['image'],
        },
      },
      {
        name: 'create_or_update_casting_page',
        description: 'Create or update an SEO casting landing page under /for/[slug].',
        parameters: {
          type: 'OBJECT',
          properties: {
            slug: { type: 'STRING' },
            keyword: { type: 'STRING' },
            title: { type: 'STRING' },
            description: { type: 'STRING' },
            body: { type: 'STRING' },
            relatedSkills: { type: 'ARRAY', items: { type: 'STRING' } },
            relatedShows: { type: 'ARRAY', items: { type: 'STRING' } },
            cta: { type: 'STRING' },
          },
          required: ['keyword', 'title', 'description', 'body'],
        },
      },
    ],
  },
];

const ALLOWED_PATH_PREFIXES = ['src/content/', 'public/images/photos/'];

function makeSlug(input, fallback) {
  const base = input || fallback || 'update';
  return slugify(base, { lower: true, strict: true });
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {Array<{ label?: string, price?: string, priceAmount?: number }>} rates
 */
function normalizeLessonRates(rates) {
  return (rates || [])
    .map((rate) => {
      const label = String(rate.label || '').trim();
      const price = String(rate.price || '').trim();
      if (!label || !price) return null;
      const parsedAmount = Number.parseFloat(price.replace(/[^0-9.]/g, ''));
      const priceAmount =
        typeof rate.priceAmount === 'number' && !Number.isNaN(rate.priceAmount)
          ? rate.priceAmount
          : Number.isNaN(parsedAmount)
            ? undefined
            : parsedAmount;
      return priceAmount === undefined ? { label, price } : { label, price, priceAmount };
    })
    .filter(Boolean);
}

/**
 * Merge frontmatter and/or body into an existing markdown page from GitHub.
 * @param {string} path
 * @param {{ data?: Record<string, unknown>, body?: string }} patch
 */
async function mergeMarkdownPage(path, { data = {}, body } = {}) {
  const existing = await readRepoTextFile(path);
  const parsed = existing ? matter(existing) : { data: {}, content: '' };
  const mergedData = { ...parsed.data, ...data, updated: todayIsoDate() };
  const mergedBody = body !== undefined ? body : parsed.content;
  const normalizedBody = String(mergedBody || '').trim();
  return matter.stringify(normalizedBody ? `${normalizedBody}\n` : '', mergedData);
}

/**
 * @param {{ tool: string, path: string, content: string, commitMessage: string, summary: string }} change
 */
function finalizeContentChange(change) {
  validateContentFile(change.path, change.content);
  return change;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isAllowedContentPath(path) {
  const p = String(path || '').replace(/\\/g, '/');
  if (!p || p.includes('..') || p.startsWith('/')) return false;
  return ALLOWED_PATH_PREFIXES.some((prefix) => p.startsWith(prefix));
}

/**
 * Build a proposed file change from a Gemini tool call (no GitHub write).
 * @returns {Promise<{ tool: string, path: string, content: string, commitMessage: string, summary: string }>}
 */
export async function buildContentChange(name, args, photoPath) {
  const today = todayIsoDate();
  /** @type {{ tool: string, path: string, content: string, commitMessage: string, summary: string }} */
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
        commitMessage: `content: upsert show ${args.title}`,
        summary: `Updated show “${args.title}” at /shows.`,
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
        commitMessage: `content: news ${args.title}`,
        summary: `Published news post “${args.title}” at /news/${slug}.`,
      };
      break;
    }
    case 'update_about': {
      const content =
        toFrontmatter({
          title: args.title || 'About',
          description: args.description || 'About Elyse Tindall',
          updated: today,
        }) +
        args.body +
        '\n';
      change = {
        tool: name,
        path: 'src/content/pages/about.md',
        content,
        commitMessage: 'content: update about page',
        summary: 'Updated the About page.',
      };
      break;
    }
    case 'update_lessons_copy': {
      const content = await mergeMarkdownPage(LESSONS_PAGE, { body: args.body });
      change = {
        tool: name,
        path: LESSONS_PAGE,
        content,
        commitMessage: 'content: update lessons copy',
        summary: 'Updated lessons philosophy and details at /lessons.',
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
        commitMessage: 'content: update lessons seo',
        summary: 'Updated Lessons page title/description.',
      };
      break;
    }
    case 'update_lesson_rates': {
      const rates = normalizeLessonRates(args.rates);
      if (!rates.length) throw new Error('update_lesson_rates requires at least one rate.');
      const content = await mergeMarkdownPage(LESSONS_BOOK_PAGE, { data: { rates } });
      change = {
        tool: name,
        path: LESSONS_BOOK_PAGE,
        content,
        commitMessage: 'content: update lesson rates',
        summary: 'Updated lesson rates at /lessons/book.',
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
        commitMessage: 'content: update lesson scheduling',
        summary: 'Updated lesson scheduling details at /lessons/book.',
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
        commitMessage: 'content: update lesson book seo',
        summary: 'Updated book-a-lesson page title/description.',
      };
      break;
    }
    case 'add_gallery_photo': {
      const image = args.image || photoPath;
      if (!image) throw new Error('Gallery photo requires an image path or upload.');
      const slug = makeSlug(
        args.slug ||
          String(image)
            .split('/')
            .pop()
            ?.replace(/\.[^.]+$/, '') ||
          'gallery-photo',
      );
      const content =
        toFrontmatter({
          caption: '',
          image,
          tags: args.tags || [],
          order: args.order,
        }) + '\n';
      change = {
        tool: name,
        path: `src/content/gallery/${slug}.md`,
        content,
        commitMessage: `content: gallery ${slug}`,
        summary: `Added gallery photo (${slug}).`,
      };
      break;
    }
    case 'create_or_update_casting_page': {
      const slug = makeSlug(args.slug || args.keyword);
      const content =
        toFrontmatter({
          keyword: args.keyword,
          title: args.title,
          description: args.description,
          relatedSkills: args.relatedSkills || [],
          relatedShows: args.relatedShows || [],
          cta: args.cta || 'Request materials',
        }) +
        args.body +
        '\n';
      change = {
        tool: name,
        path: `src/content/casting/${slug}.md`,
        content,
        commitMessage: `content: casting page ${args.keyword}`,
        summary: `Casting page ready at /for/${slug}.`,
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
  if (p === 'src/content/pages/lessons.md') return '/lessons';
  if (p === 'src/content/pages/lessons-book.md') return '/lessons/book';
  if (/^src\/content\/gallery\/[^/]+\.md$/.test(p)) return '/gallery';
  if ((m = /^src\/content\/casting\/([^/]+)\.md$/.exec(p))) return `/for/${m[1]}`;
  if ((m = /^public\/(images\/photos\/[^/]+)$/.exec(p))) return `/${m[1]}`;
  return null;
}

/**
 * Commit approved content changes to GitHub.
 * @param {Array<{ path: string, content: string, commitMessage?: string, message?: string, tool?: string, summary?: string }>} changes
 */
export async function applyContentChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new Error('No content changes to publish.');
  }

  const actions = [];
  let commitSha = '';
  for (const change of changes) {
    const path = String(change.path || '').replace(/\\/g, '/');
    if (!isAllowedContentPath(path)) {
      throw new Error(`Disallowed content path: ${path}`);
    }
    const content = String(change.content ?? '');
    validateContentFile(path, content);
    const commitMessage = String(change.commitMessage || change.message || `content: update ${path}`);
    const committed = await commitFile({ path, content, message: commitMessage });
    if (committed.commitSha) commitSha = committed.commitSha;
    const summary = change.summary || `Updated ${path}.`;
    trackEvent('StudioToolExecuted', { tool: change.tool || 'publish' });
    actions.push({
      tool: change.tool || 'publish',
      summary,
      path,
      url: publicUrlForContentPath(path),
      commitSha: committed.commitSha || undefined,
    });
  }

  const reply =
    actions.map((a) => a.summary).join(' ') +
    ' The site will rebuild and go live within a few minutes.';

  return { reply, actions, commitSha: commitSha || undefined };
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
 * Build a compact catalog of live portfolio pages from the GitHub content branch.
 * Failures are non-fatal — Studio can still draft without the catalog.
 * @returns {Promise<string>}
 */
export async function buildProductionSiteContext() {
  const siteUrl = productionSiteUrl();
  const lines = [
    `Production site (canonical reference): ${siteUrl}`,
    'Site map: / (home), /shows, /about, /lessons, /lessons/book, /news, /gallery, /contact, /for/[slug] (casting).',
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
      return lines.join('\n');
    }

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
  } catch {
    lines.push(
      `- Catalog unavailable; still treat ${siteUrl} as the live site and avoid inventing credits.`,
    );
  }

  return lines.join('\n');
}

/**
 * Ask Gemini for tool calls and return proposed file changes (no commits).
 * @param {{ message: string, photoPath?: string }} opts
 */
export async function runContentAgent({ message, photoPath }) {
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
- Prefer create_news_post for press and announcements.
- Prefer create_or_update_casting_page for SEO/casting keyword pages (write real helpful copy, not thin spam); reuse existing casting slugs when she means an existing page.
- Prefer update_about when she asks to change her biography or performer background at ${siteUrl}/about.
- Prefer update_lessons_copy when she asks to change lessons philosophy, approach, or teaching details at ${siteUrl}/lessons. Never include dollar amounts or rates in that copy.
- Prefer update_lessons_seo only when she explicitly wants to change the Lessons page title or search description.
- Prefer update_lesson_rates when she asks to change lesson prices or session rates. This updates ${siteUrl}/lessons/book only — provide the full rates list.
- Prefer update_lesson_scheduling when she asks about lesson format (NYC/Zoom), how to book, scheduling, or what students should expect on the book page.
- Prefer update_lesson_book_seo only when she explicitly wants to change the book-a-lesson page title or search description.
- Never use lessons tools to change show credits, news, or gallery content.
- When drafting lessons copy, keep it vocal-coach accurate (pedagogy, vocal health, CCM); never add acting-lesson offerings.
- Prefer add_gallery_photo when she attaches a photo for the gallery (image path will be provided). Leave caption empty — the public gallery does not display captions.
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
    const change = await buildContentChange(call.name, call.args || {}, photoPath);
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
