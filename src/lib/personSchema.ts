import { site } from './site';

/** Public identity URLs for Person `sameAs` (DISC-P1-004). */
export function personSameAs(): string[] {
  return [site.instagram, site.youtube].filter(Boolean);
}

export function personAlumniOf() {
  return [
    { '@type': 'Organization' as const, name: 'Broadway Artists Alliance' },
    { '@type': 'CollegeOrUniversity' as const, name: 'University of the Arts' },
  ];
}

/** Performer facts that schema.org Person does not model as first-class fields. */
export function personAdditionalProperties(): Record<string, unknown>[] {
  const p = site.performer;
  const props: Record<string, unknown>[] = [];
  if (p.playingAge) {
    props.push({ '@type': 'PropertyValue', name: 'Playing age', value: p.playingAge });
  }
  if (p.vocalType) {
    props.push({ '@type': 'PropertyValue', name: 'Vocal type', value: p.vocalType });
  }
  if (p.vocalRange) {
    props.push({ '@type': 'PropertyValue', name: 'Vocal range', value: p.vocalRange });
  }
  if (p.ethnicity) {
    props.push({
      '@type': 'PropertyValue',
      name: 'Ethnicity / presenting',
      value: p.ethnicity,
    });
  }
  if (p.union) {
    props.push({ '@type': 'PropertyValue', name: 'Union', value: p.union });
  }
  if (p.availability) {
    props.push({ '@type': 'PropertyValue', name: 'Availability', value: p.availability });
  }
  return props;
}

type PersonOverrides = Record<string, unknown>;

/**
 * Shared Person JSON-LD for Seo defaults, homepage `@graph`, and casting landers.
 * Pass overrides to layer page-specific `knowsAbout` / `description` without dropping alumniOf / sameAs.
 */
export function buildPersonJsonLd(overrides: PersonOverrides = {}): Record<string, unknown> {
  const additional = personAdditionalProperties();
  const person: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: site.name,
    url: site.url,
    jobTitle: site.jobTitle,
    description: site.description,
    image: new URL(site.heroImage, site.url).href,
    sameAs: personSameAs(),
    knowsAbout: site.knowsAbout,
    alumniOf: personAlumniOf(),
    homeLocation: {
      '@type': 'Place',
      name: 'New York, NY',
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'New York',
      addressRegion: 'NY',
      addressCountry: 'US',
    },
  };

  if (site.performer.height) {
    person.height = site.performer.height;
  }
  if (additional.length) {
    person.additionalProperty = additional;
  }

  return { ...person, ...overrides };
}
