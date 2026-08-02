import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const showCategory = z.enum(['musical', 'play', 'cabaret']).default('musical');

const shows = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/shows' }),
  schema: z.object({
    title: z.string(),
    year: z.number(),
    role: z.string().optional(),
    venue: z.string().optional(),
    synopsis: z.string(),
    image: z.string().optional(),
    videoUrl: z.string().url().optional(),
    category: showCategory,
    featured: z.boolean().default(false),
    order: z.number().optional(),
  }),
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    videoUrl: z.string().url().optional(),
    draft: z.boolean().default(false),
  }),
});

const gallery = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/gallery' }),
  schema: z.object({
    caption: z.string().default(''),
    image: z.string(),
    tags: z.array(z.string()).default([]),
    order: z.number().optional(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    updated: z.coerce.date().optional(),
  }),
});

const casting = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/casting' }),
  schema: z.object({
    keyword: z.string(),
    title: z.string(),
    description: z.string(),
    relatedSkills: z.array(z.string()).default([]),
    relatedShows: z.array(z.string()).default([]),
    cta: z.string().default('Request materials'),
  }),
});

export const collections = { shows, news, gallery, pages, casting };
