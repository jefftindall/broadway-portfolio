import { z } from 'zod';

export const showCategory = z.enum(['musical', 'play', 'cabaret', 'film']).default('musical');

export const lessonRateSchema = z.object({
  label: z.string().min(1),
  price: z.string().min(1),
  priceAmount: z.number().optional(),
});

export const showFrontmatterSchema = z.object({
  title: z.string().min(1),
  year: z.number(),
  role: z.string().optional(),
  /** Resume/site location line: "[Theater Name] - [City], [ST]". Extra room/program detail belongs in body. */
  venue: z.string().optional(),
  synopsis: z.string().min(1),
  image: z.string().optional(),
  /** CSS object-position for credit thumbnails (e.g. "18% 40%") when the subject is off-center */
  imageFocus: z.string().default('center top'),
  videoUrl: z.string().url().optional(),
  category: showCategory,
  featured: z.boolean().default(false),
  /** Within the same year, lower order = newer (credits and homepage featured sort newest first). */
  order: z.number().optional(),
});

export const newsFrontmatterSchema = z.object({
  title: z.string().min(1),
  date: z.coerce.date(),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  image: z.string().optional(),
  videoUrl: z.string().url().optional(),
  draft: z.boolean().default(false),
});

export const galleryFrontmatterSchema = z.object({
  caption: z.string().default(''),
  image: z.string().min(1),
  tags: z.array(z.string()).default([]),
  order: z.number().optional(),
  /** CSS object-position for gallery tiles (e.g. "50% 18%", "center top") */
  focus: z.string().default('center'),
});

export const pagesFrontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  updated: z.coerce.date().optional(),
  rates: z.array(lessonRateSchema).optional(),
  format: z.string().optional(),
  scheduling: z.string().optional(),
});

export const lessonsBookFrontmatterSchema = pagesFrontmatterSchema.extend({
  rates: z.array(lessonRateSchema).min(1, 'At least one lesson rate is required'),
});

export const castingFrontmatterSchema = z.object({
  keyword: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  relatedSkills: z.array(z.string()).default([]),
  relatedShows: z.array(z.string()).default([]),
  cta: z.string().default('Request materials'),
});
