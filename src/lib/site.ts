import { ageInYears } from './age';
import { REEL_POSTER_PATH } from './reelPoster';
import siteSettings from '../data/site-settings.json';

function requiredSiteEnv(name: 'SITE_CONTACT_EMAIL', fromMeta: string | undefined): string {
  const value = String(process.env[name] ?? fromMeta ?? '').trim();
  if (!value) {
    throw new Error(
      `${name} must be set (Key Vault secret or local .env). See .env.example and docs/runbooks/rotate-secrets.md.`,
    );
  }
  return value;
}

/** Casting-facing performer facts (DISC-P1-003). Optional keys omit from UI until set. */
export type PerformerSpec = {
  vocalType: string;
  vocalRange: string;
  union: string;
  availability: string;
  playingAge?: string;
  ethnicity?: string;
  height?: string;
};

export const site = {
  name: 'Elyse Tindall',
  tagline: 'Musical Theatre Actress & Vocal Coach · Atlanta to New York',
  jobTitle: 'Musical Theatre Actress & Vocal Coach',
  url: 'https://elysetindall.com',
  email: requiredSiteEnv('SITE_CONTACT_EMAIL', import.meta.env.SITE_CONTACT_EMAIL),
  instagram: 'https://www.instagram.com/elyse.tindall/',
  /**
   * YouTube presence for Person `sameAs` (DISC-P1-004).
   * Stage Kiss reel until a verified channel URL lands via DISC-GAP-007.
   */
  youtube: 'https://www.youtube.com/watch?v=41jdPTkN_Sw',
  /** Studio-writable via site-settings.json */
  reelUrl: siteSettings.reelUrl,
  /** Accessible name for the casting-reel VideoEmbed (`Play {title}` / iframe title). */
  reelTitle: siteSettings.reelTitle,
  /**
   * Click-to-play / JSON-LD still. Studio overwrites `public/images/photos/reel-poster.jpg`
   * on `update_reel_url`; display uses derived WebP after the next build.
   */
  reelPoster: REEL_POSTER_PATH,
  /** About lead paragraph — Studio-writable; SEO description stays locked below */
  shortBio: siteSettings.shortBio,
  /** Homepage press quote — Studio-writable */
  pressQuote: siteSettings.pressQuote as { quote: string; attribution: string },
  heroImage: '/images/photos/elyse-portrait.jpg',
  description:
    'Elyse Tindall is a musical theatre actress and vocal coach from Atlanta, now based in New York City — stage credits, private voice lessons rooted in vocal pedagogy and CCM, and casting materials.',
  location: 'New York, NY and Atlanta, GA',
  /** Chronological age at build time (from SITE_DATE_OF_BIRTH). */
  get age() {
    return ageInYears();
  },
  performer: siteSettings.performer as PerformerSpec,
  materials: {
    resumePdf: '/downloads/elyse-tindall-resume.pdf',
    headshotTheatrical: '/downloads/elyse-tindall-headshot-theatrical.jpg',
  },
  knowsAbout: [
    'Musical theatre',
    'Stage acting',
    'Musical comedy',
    'Cabaret',
    'Mezzo-soprano',
    'Belt singing',
    'Vocal pedagogy',
    'Vocal health',
    'Contemporary commercial music',
    'CCM singing',
    'Musical theatre voice',
    'Private vocal coaching',
  ],
};

/** Primary nav — logo is Home; Gallery lives under About + footer. */
export const nav = [
  { href: '/shows', label: 'Shows' },
  { href: '/materials', label: 'Materials' },
  { href: '/lessons', label: 'Lessons' },
  { href: '/about', label: 'About' },
  { href: '/news', label: 'News' },
  { href: '/contact', label: 'Contact' },
] as const;

export const lessonOfferings = [
  {
    title: 'Vocal Pedagogy & Technique',
    description:
      'Evidence-informed teaching for breath, registration, resonance, and coordination — built for lasting, flexible singing.',
  },
  {
    title: 'Vocal Health',
    description:
      'Sustainable habits that protect the instrument: warm-ups, recovery, pacing, and singing without strain.',
  },
  {
    title: 'Contemporary Commercial Music',
    description:
      'CCM styles with stylistic authenticity and healthy technique — pop, rock, musical theatre belt, and beyond.',
  },
  {
    title: 'Repertoire & Audition Songs',
    description:
      'Song choice, cuts, and vocal storytelling for callbacks and books — singing-focused preparation for the room.',
  },
] as const;
