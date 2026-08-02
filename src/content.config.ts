import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import {
  castingFrontmatterSchema,
  galleryFrontmatterSchema,
  newsFrontmatterSchema,
  pagesFrontmatterSchema,
  showFrontmatterSchema,
} from '../shared/contentSchemas.js';

const shows = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/shows' }),
  schema: showFrontmatterSchema,
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: newsFrontmatterSchema,
});

const gallery = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/gallery' }),
  schema: galleryFrontmatterSchema,
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: pagesFrontmatterSchema,
});

const casting = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/casting' }),
  schema: castingFrontmatterSchema,
});

export const collections = { shows, news, gallery, pages, casting };
