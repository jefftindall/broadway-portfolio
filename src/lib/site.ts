export const site = {
  name: 'Elyse Tindall',
  tagline: 'Musical Theatre Actress & Vocal Coach · Atlanta to New York',
  jobTitle: 'Musical Theatre Actress & Vocal Coach',
  url: 'https://elysetindall.com',
  email: 'elyse.tindall@gmail.com',
  instagram: 'https://www.instagram.com/elyse.tindall/',
  reelUrl: 'https://youtu.be/41jdPTkN_Sw',
  heroImage: '/images/photos/elyse-portrait.jpg',
  description:
    'Elyse Tindall is a musical theatre actress and vocal coach from Atlanta, now based in New York City — stage credits, private voice lessons rooted in vocal pedagogy and CCM, and casting materials.',
  location: 'New York, NY',
  knowsAbout: [
    'Vocal pedagogy',
    'Vocal health',
    'Contemporary commercial music',
    'CCM singing',
    'Musical theatre voice',
    'Private vocal coaching',
  ],
};

export const nav = [
  { href: '/', label: 'Home' },
  { href: '/shows', label: 'Shows' },
  { href: '/about', label: 'About' },
  { href: '/lessons', label: 'Lessons' },
  { href: '/news', label: 'News' },
  { href: '/gallery', label: 'Gallery' },
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
