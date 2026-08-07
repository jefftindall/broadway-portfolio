/**
 * Studio help catalog — single source of truth for the authenticated `/studio/help`
 * page and for agents refining Gemini tools.
 *
 * When you add, change, or remove a tool in `api/src/lib/gemini.js`, update the
 * matching entry here (and the voice / access copy in `src/pages/studio/help.astro`
 * if the UX changed). See `docs/runbooks/refine-studio-gemini.md` and
 * `.cursor/rules/studio-help.mdc`.
 */

export type StudioCapability = {
  /** Matches the Gemini tool name in api/src/lib/gemini.js when applicable */
  tool: string;
  title: string;
  summary: string;
  livePath: string;
  examplePrompts: string[];
};

/** Discrete natural-language prompts Studio can turn into site updates. */
export const studioCapabilities: StudioCapability[] = [
  {
    tool: 'upsert_show',
    title: 'Show & credit updates',
    summary:
      'Add or update a performance credit (role, venue, year, synopsis). Venue should be “[Theater] - [City], [ST]”; put room/program detail in the description. Mark headline credits as featured so they can appear on the homepage.',
    livePath: '/shows',
    examplePrompts: [
      'I just booked Lily in Anastasia at the Strand Theater in Marietta, July 2025.',
      'Update Listen so the venue is Alliance Theatre - Atlanta, GA, and mention the Farideh & Al Azadi Gallery in the description.',
      'Add a cabaret credit at Don’t Tell Mama in New York — spring cabaret, featured true.',
    ],
  },
  {
    tool: 'create_news_post',
    title: 'News & announcements',
    summary: 'Post press, appearances, and one-off announcements on the news page.',
    livePath: '/news',
    examplePrompts: [
      'Write a news post that I was featured in BroadwayWorld for my Anastasia debut.',
      'Announce that I’m opening private voice lesson availability in September.',
    ],
  },
  {
    tool: 'add_gallery_photo',
    title: 'Gallery photos',
    summary:
      'Attach a JPEG, PNG, or WebP photo and ask to add it to the gallery. Captions stay empty — the public gallery does not show them.',
    livePath: '/gallery',
    examplePrompts: [
      'Add this photo to my gallery.',
      'Put this headshot in the gallery.',
    ],
  },
  {
    tool: 'update_about',
    title: 'About page',
    summary: 'Rewrite your biography and performer background on the About page.',
    livePath: '/about',
    examplePrompts: [
      'Refresh my About page to emphasize Atlanta roots and New York musical theatre work.',
      'Update my bio to mention private voice lessons and CCM coaching.',
    ],
  },
  {
    tool: 'update_lessons_copy',
    title: 'Lessons philosophy',
    summary:
      'Update teaching approach and philosophy on /lessons. Voice lessons only (pedagogy, vocal health, CCM) — not acting classes. Do not put prices here.',
    livePath: '/lessons',
    examplePrompts: [
      'Rewrite my lessons page to focus on vocal health and CCM for musical theatre singers.',
      'Update lessons copy to mention Zoom and in-person NYC options without listing prices.',
    ],
  },
  {
    tool: 'update_lessons_seo',
    title: 'Lessons page SEO',
    summary: 'Change only the Lessons page title or search description.',
    livePath: '/lessons',
    examplePrompts: [
      'Change the Lessons page search title to Private Voice Lessons in NYC.',
    ],
  },
  {
    tool: 'update_lesson_rates',
    title: 'Lesson rates',
    summary: 'Update session prices on the book-a-lesson page. Provide the full rate list.',
    livePath: '/lessons/book',
    examplePrompts: [
      'Set my lesson rates to $60 for 30 minutes and $100 for 60 minutes.',
      'Raise my 60-minute rate to $120 and keep the 30-minute rate at $60.',
    ],
  },
  {
    tool: 'update_lesson_scheduling',
    title: 'Lesson format & booking',
    summary:
      'Update format (NYC / Zoom), how to book, and what students should expect on /lessons/book.',
    livePath: '/lessons/book',
    examplePrompts: [
      'Update booking instructions: students should email with goals, experience, and preferred times.',
      'Say lessons are available in person in NYC or on Zoom.',
    ],
  },
  {
    tool: 'update_lesson_book_seo',
    title: 'Book page SEO',
    summary: 'Change only the book-a-lesson page title or search description.',
    livePath: '/lessons/book',
    examplePrompts: [
      'Update the book page meta description for NYC private voice lessons.',
    ],
  },
  {
    tool: 'create_or_update_casting_page',
    title: 'Casting / “for” pages',
    summary:
      'Create or refresh an SEO casting landing page under /for/… with helpful copy (not thin keyword spam).',
    livePath: '/for',
    examplePrompts: [
      'Create a casting page for musical theatre actress in New York.',
      'Update my Broadway actress casting page with current credits and a clear CTA.',
    ],
  },
];

export const studioVoiceNotes = {
  referenceDevice: 'iPhone 17 · Safari',
  holdToSpeak:
    'Press and hold Hold to speak while you talk. Lift your finger when you finish. Your words appear in the Message box — same as typing.',
  replacesNotAppends:
    'Each hold-to-speak pass replaces the Message box. If you need to edit, type after speaking, or speak again with the full request.',
  fallback: 'If voice is unavailable, type your request — Preview update works the same either way.',
};
