import { GoogleGenerativeAI } from '@google/generative-ai';
import { trackEvent } from './telemetry.js';
import slugify from 'slugify';
import { commitFile, listRepoFiles, readRepoTextFile, toFrontmatter } from './github.js';

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
            featured: { type: 'BOOLEAN' },
            videoUrl: { type: 'STRING' },
            image: { type: 'STRING' },
            category: {
              type: 'STRING',
              description: 'Credit type: musical, play, or cabaret',
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
        name: 'update_lessons',
        description:
          'Replace the Lessons page markdown for private VOICE lessons only (vocal pedagogy, vocal health, CCM). Never advertise acting, monologue, or scene-study lessons.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            description: { type: 'STRING' },
            body: {
              type: 'STRING',
              description:
                'Markdown for private vocal coaching. Emphasize vocal pedagogy, vocal health, and CCM. Do not offer acting lessons.',
            },
          },
          required: ['body'],
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
 * @returns {{ tool: string, path: string, content: string, commitMessage: string, summary: string }}
 */
export function buildContentChange(name, args, photoPath) {
  const today = new Date().toISOString().slice(0, 10);

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
          videoUrl: args.videoUrl,
          image: args.image || photoPath,
          category: args.category || undefined,
        }) +
        (args.body || args.synopsis) +
        '\n';
      return {
        tool: name,
        path: `src/content/shows/${slug}.md`,
        content,
        commitMessage: `content: upsert show ${args.title}`,
        summary: `Updated show “${args.title}” at /shows.`,
      };
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
      return {
        tool: name,
        path: `src/content/news/${slug}.md`,
        content,
        commitMessage: `content: news ${args.title}`,
        summary: `Published news post “${args.title}” at /news/${slug}.`,
      };
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
      return {
        tool: name,
        path: 'src/content/pages/about.md',
        content,
        commitMessage: 'content: update about page',
        summary: 'Updated the About page.',
      };
    }
    case 'update_lessons': {
      const content =
        toFrontmatter({
          title: args.title || 'Lessons',
          description: args.description || 'Lessons with Elyse Tindall',
          updated: today,
        }) +
        args.body +
        '\n';
      return {
        tool: name,
        path: 'src/content/pages/lessons.md',
        content,
        commitMessage: 'content: update lessons page',
        summary: 'Updated the Lessons page.',
      };
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
      return {
        tool: name,
        path: `src/content/gallery/${slug}.md`,
        content,
        commitMessage: `content: gallery ${slug}`,
        summary: `Added gallery photo (${slug}).`,
      };
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
      return {
        tool: name,
        path: `src/content/casting/${slug}.md`,
        content,
        commitMessage: `content: casting page ${args.keyword}`,
        summary: `Casting page ready at /for/${slug}.`,
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
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
    'Site map: / (home), /shows, /about, /lessons, /news, /gallery, /contact, /for/[slug] (casting).',
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
- Prefer upsert_show for new bookings/credits; when updating an existing show, reuse its slug from the catalog.
- Prefer create_news_post for press and announcements.
- Prefer create_or_update_casting_page for SEO/casting keyword pages (write real helpful copy, not thin spam); reuse existing casting slugs when she means an existing page.
- Prefer update_about / update_lessons when she asks to change those pages; treat them as edits to the live ${siteUrl}/about and ${siteUrl}/lessons pages.
- When drafting or updating lessons copy, keep it vocal-coach accurate (pedagogy, vocal health, CCM); never add acting-lesson offerings.
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
    const change = buildContentChange(call.name, call.args || {}, photoPath);
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
