import { ageInYears } from './age';

function requiredSiteEnv(name: 'SITE_CONTACT_EMAIL', fromMeta: string | undefined): string {
  const value = String(process.env[name] ?? fromMeta ?? '').trim();
  if (!value) {
    throw new Error(
      `${name} must be set (Key Vault secret or local .env). See .env.example and docs/runbooks/rotate-secrets.md.`,
    );
  }
  return value;
}

export const site = {
  name: 'Elyse Tindall',
  tagline: 'Musical Theatre Actress & Vocal Coach · Atlanta to New York',
  jobTitle: 'Musical Theatre Actress & Vocal Coach',
  url: 'https://elysetindall.com',
  email: requiredSiteEnv('SITE_CONTACT_EMAIL', import.meta.env.SITE_CONTACT_EMAIL),
  instagram: 'https://www.instagram.com/elyse.tindall/',
  reelUrl: 'https://youtu.be/41jdPTkN_Sw',
  heroImage: '/images/photos/elyse-portrait.jpg',
  description:
    'Elyse Tindall is a musical theatre actress and vocal coach from Atlanta, now based in New York City — stage credits, private voice lessons rooted in vocal pedagogy and CCM, and casting materials.',
  location: 'New York, NY',
  /** Chronological age at build time (from SITE_DATE_OF_BIRTH). */
  get age() {
    return ageInYears();
  },
  materials: {
    resumePdf: '/downloads/elyse-tindall-resume.pdf',
    headshotTheatrical: '/downloads/elyse-tindall-headshot-theatrical.jpg',
  },
  knowsAbout: [
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
