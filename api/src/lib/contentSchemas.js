import { z } from 'zod';

export const showCategory = z.enum(['musical', 'play', 'cabaret', 'film']).default('musical');

/** Stable lesson rate ids — Gemini cannot invent additional tiers. */
export const LESSON_RATE_ID_VALUES = ['30min', '60min'];

export const LESSON_RATE_DEFS = {
  '30min': { id: '30min', label: '30-minute session' },
  '60min': { id: '60min', label: '60-minute session' },
};

export const lessonRateIdSchema = z.enum(['30min', '60min']);

export const lessonRateSchema = z.object({
  id: lessonRateIdSchema,
  label: z.string().min(1),
  price: z.string().min(1),
  priceAmount: z.number().positive(),
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
  /** Gallery grid sort; lower = newer / first. Studio auto-assigns on upload. */
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

export const lessonsBookFrontmatterSchema = pagesFrontmatterSchema
  .extend({
    rates: z.array(lessonRateSchema).min(1, 'At least one lesson rate is required'),
  })
  .superRefine((data, ctx) => {
    const ids = new Set(data.rates.map((rate) => rate.id));
    for (const id of LESSON_RATE_ID_VALUES) {
      if (!ids.has(id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Missing required rate id: ${id}`,
          path: ['rates'],
        });
      }
    }
    if (data.rates.length !== LESSON_RATE_ID_VALUES.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Exactly two lesson rates (30-minute and 60-minute) are allowed',
        path: ['rates'],
      });
    }
  });

export const castingFrontmatterSchema = z.object({
  keyword: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  relatedSkills: z.array(z.string()).default([]),
  relatedShows: z.array(z.string()).default([]),
  cta: z.string().default('Request materials'),
});

export const performerSpecSchema = z.object({
  vocalType: z.string().min(1),
  vocalRange: z.string().min(1),
  union: z.string().min(1),
  availability: z.string().min(1),
  playingAge: z.string().optional(),
  ethnicity: z.string().optional(),
  height: z.string().optional(),
});

export const PERFORMER_FACT_KEYS = [
  'availability',
  'vocalType',
  'vocalRange',
  'union',
  'playingAge',
  'ethnicity',
  'height',
];

export const pressQuoteSchema = z.object({
  quote: z.string().min(1).max(280),
  attribution: z.string().min(1).max(120),
});

export const siteSettingsSchema = z.object({
  reelUrl: z.string().url(),
  shortBio: z.string().min(1).max(600),
  pressQuote: pressQuoteSchema,
  performer: performerSpecSchema,
});
