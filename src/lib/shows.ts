import type { CollectionEntry } from 'astro:content';

/**
 * Homepage “Stage & reel” cards: featured credits only, newest first.
 * Mark shows with `featured: true` in content; the home page always shows
 * the three most recent by `year`, then `order` (lower order = newer within
 * the same year). Keep the featured set intentional — typically headline
 * credits, not the full résumé.
 */
export function getFeaturedShowsForHome(
  shows: CollectionEntry<'shows'>[],
  limit = 3,
): CollectionEntry<'shows'>[] {
  return shows
    .filter((s) => s.data.featured)
    .sort((a, b) => {
      if (b.data.year !== a.data.year) return b.data.year - a.data.year;
      return (a.data.order ?? 99) - (b.data.order ?? 99);
    })
    .slice(0, limit);
}
