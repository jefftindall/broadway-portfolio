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
      'From the Studio hub, open Gallery photo — attach a JPEG, PNG, or WebP (the original file is what gets published; the site build creates smaller display versions), pick tags from the fixed filter list (custom tags can’t be added), set crop focus, and optionally set a stable gallery file name (Studio adds .md). Confirm a site-style tile Preview before publishing. New photos always appear first in the public gallery. You can still attach a photo under Speak or type and ask to add it. Captions stay empty — the public gallery does not show them. If the exact file is already on the site, Studio warns before preview so you can avoid duplicates.',
    livePath: '/gallery',
    examplePrompts: [
      'Add this photo to my gallery.',
      'Put this headshot in the gallery with tags headshot and portrait.',
    ],
  },
  {
    tool: 'update_short_bio',
    title: 'Short bio (About)',
    summary:
      'Update the short lead paragraph at the top of About. Edit in the Studio hub (or by voice), then confirm in read-only Preview before publishing. Longer About sections stay PR-only.',
    livePath: '/about',
    examplePrompts: [
      'Update my short bio on About to: Elyse Tindall is a musical theatre actress and vocal coach from Atlanta, now based in New York City.',
      'Change my About short bio to emphasize Atlanta roots and New York musical theatre work.',
    ],
  },
  {
    tool: 'update_press_quote',
    title: 'Press quote (Home)',
    summary:
      'Update the homepage press quote and attribution under the hero. Edit in the Studio hub (or by voice), then confirm with a site-style quote Preview before publishing.',
    livePath: '/',
    examplePrompts: [
      'Change my homepage quote to: The funniest actor you’ve never seen. Attribution Tiffany King.',
      'Update the press quote attribution to Tiffany King.',
    ],
  },
  {
    tool: 'update_performer_facts',
    title: 'Performer facts',
    summary:
      'Update casting facts shown on About and Materials (availability, vocal type/range, union, playing age, height, ethnicity). Edit in the Studio hub (or by voice), then confirm in a site-style Performer facts Preview before publishing.',
    livePath: '/materials',
    examplePrompts: [
      'Mark me unavailable until September.',
      'Set availability to Available.',
      'Update my vocal range to D3-G6 (Belt: G5).',
      'Change my vocal type to Mezzo-Soprano with an extended range.',
      'Set my union status to Non-union.',
      'Update my playing age to 15–28.',
      'Set my height to 5\'3" (160 cm).',
      'Update my ethnicity line to White; olive skin presents as Mediterranean and ethnically ambiguous.',
    ],
  },
  {
    tool: 'update_reel_url',
    title: 'Reel link',
    summary:
      'Change the casting reel video link and the video embed title (play button / iframe name) on Materials, Shows, and home. Publishing also refreshes the reel poster still from YouTube or Vimeo. Does not change show credits or Materials page copy. Edit in the Studio hub (or by voice), then confirm with an embedded video Preview before publishing.',
    livePath: '/materials',
    examplePrompts: [
      'Update my reel to this YouTube link: https://youtu.be/41jdPTkN_Sw',
      'Rename the reel play-button title to NYC Cabaret — Stage Kiss reel.',
      'Change the reel on Materials to my newest Stage Kiss video.',
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
      'Update the Lessons page meta description for vocal coaching in New York.',
    ],
  },
  {
    tool: 'update_lesson_rates',
    title: 'Lesson rates',
    summary:
      'Update session prices on the book-a-lesson page. From the Studio hub, open Lesson rates and enter dollar amounts — or say a prompt under Speak or type. Preview shows the rates block as it will appear on the book page.',
    livePath: '/lessons/book',
    examplePrompts: [
      'Raise my 60-minute rate to $120 and keep the 30-minute rate at $60.',
      'Set 30 minutes to $65 and 60 minutes to $110.',
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
      'Change the book-a-lesson page title to Book a Voice Lesson in NYC.',
    ],
  },
  {
    tool: 'update_casting_fields',
    title: 'Casting page fields',
    summary:
      'Update title, description, CTA, keyword, or related shows/skills on an existing /for/… page. New casting pages are added by hand (see the casting runbook) — Studio does not create them. Do not add links or CTAs below Related credits; the footer already has Materials / Contact / Lessons.',
    livePath: '/for',
    examplePrompts: [
      'Change the CTA on my musical theatre actress page to Request materials.',
      'Add Anastasia to related shows on my musical theatre actress casting page.',
    ],
  },
];

export const studioVoiceNotes = {
  referenceDevice: 'iPhone 17 · Safari',
  holdToSpeak:
    'Press and hold Hold to speak while you talk. Lift your finger when you finish. Your words appear in the Message box — same as typing.',
  replacesNotAppends:
    'Each hold-to-speak pass replaces the Message box. If you need to edit, type after speaking, or speak again with the full request.',
  fallback:
    'If voice is unavailable, type your request — or open Gallery photo / Lesson rates / Performer facts from the Studio hub. Preview works the same either way.',
};
