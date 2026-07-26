import { GoogleGenerativeAI } from '@google/generative-ai';
import slugify from 'slugify';
import { commitFile, toFrontmatter } from './github.js';

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
        description: 'Replace the About page markdown (background + philosophy).',
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
        description: 'Replace the Lessons page markdown.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            description: { type: 'STRING' },
            body: { type: 'STRING' },
          },
          required: ['body'],
        },
      },
      {
        name: 'add_gallery_photo',
        description: 'Add a gallery entry referencing an already-uploaded image path.',
        parameters: {
          type: 'OBJECT',
          properties: {
            slug: { type: 'STRING' },
            caption: { type: 'STRING' },
            image: { type: 'STRING', description: 'Path like /images/photos/foo.jpg or src path served as public' },
            tags: { type: 'ARRAY', items: { type: 'STRING' } },
            order: { type: 'NUMBER' },
          },
          required: ['caption', 'image'],
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

function makeSlug(input, fallback) {
  const base = input || fallback || 'update';
  return slugify(base, { lower: true, strict: true });
}

async function handleToolCall(name, args, photoPath) {
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
        }) + (args.body || args.synopsis) + '\n';
      await commitFile({
        path: `src/content/shows/${slug}.md`,
        content,
        message: `content: upsert show ${args.title}`,
      });
      return `Updated show “${args.title}” at /shows.`;
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
        }) + args.body + '\n';
      await commitFile({
        path: `src/content/news/${slug}.md`,
        content,
        message: `content: news ${args.title}`,
      });
      return `Published news post “${args.title}” at /news/${slug}.`;
    }
    case 'update_about': {
      const content =
        toFrontmatter({
          title: args.title || 'About',
          description: args.description || 'About Elyse Tindall',
          updated: today,
        }) + args.body + '\n';
      await commitFile({
        path: 'src/content/pages/about.md',
        content,
        message: 'content: update about page',
      });
      return 'Updated the About page.';
    }
    case 'update_lessons': {
      const content =
        toFrontmatter({
          title: args.title || 'Lessons',
          description: args.description || 'Lessons with Elyse Tindall',
          updated: today,
        }) + args.body + '\n';
      await commitFile({
        path: 'src/content/pages/lessons.md',
        content,
        message: 'content: update lessons page',
      });
      return 'Updated the Lessons page.';
    }
    case 'add_gallery_photo': {
      const slug = makeSlug(args.slug || args.caption);
      const image = args.image || photoPath;
      if (!image) throw new Error('Gallery photo requires an image path or upload.');
      const content =
        toFrontmatter({
          caption: args.caption,
          image,
          tags: args.tags || [],
          order: args.order,
        }) + '\n';
      await commitFile({
        path: `src/content/gallery/${slug}.md`,
        content,
        message: `content: gallery ${args.caption}`,
      });
      return `Added gallery photo “${args.caption}”.`;
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
        }) + args.body + '\n';
      await commitFile({
        path: `src/content/casting/${slug}.md`,
        content,
        message: `content: casting page ${args.keyword}`,
      });
      return `Casting page ready at /for/${slug}.`;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function runContentAgent({ message, photoPath }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    tools,
    systemInstruction: `You are Elyse Tindall's website publishing assistant.
Turn her natural-language requests into the appropriate tool call to update her Astro portfolio.
Rules:
- Prefer upsert_show for new bookings/credits.
- Prefer create_news_post for press and announcements.
- Prefer create_or_update_casting_page for SEO/casting keyword pages (write real helpful copy, not thin spam).
- Prefer update_about / update_lessons when she asks to change those pages.
- Prefer add_gallery_photo when she attaches a photo for the gallery (image path will be provided).
- Keep tone professional, warm, and accurate. Do not invent fake credits.
- Always call a tool when an update is requested; do not only chat.`,
  });

  const prompt = photoPath
    ? `${message}\n\n[Attached photo will be available at path: ${photoPath}]`
    : message;

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
    const text = response.text?.() || 'I could not map that to a website update. Try being more specific.';
    return { reply: text, actions: [] };
  }

  const actions = [];
  for (const call of functionCalls) {
    const summary = await handleToolCall(call.name, call.args || {}, photoPath);
    actions.push({ tool: call.name, summary });
  }

  const reply =
    actions.map((a) => a.summary).join(' ') +
    ' The site will rebuild and go live within a few minutes.';

  return { reply, actions };
}
