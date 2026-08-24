/**
 * Studio People (CRM) — labels shared by `/studio/people` and help.
 * Not a Gemini tool. Do not invent voice prompts that mutate CRM.
 */

export const STUDIO_PERSONAS = ['student', 'parent', 'agent', 'casting', 'alumni'] as const;

export type StudioPersona = (typeof STUDIO_PERSONAS)[number];

export const STUDIO_PERSONA_LABELS: Record<StudioPersona, string> = {
  student: 'Student',
  parent: 'Parent',
  agent: 'Agent',
  casting: 'Casting',
  alumni: 'Alumni',
};

export const STUDIO_STUDENT_FORMATS = ['nyc', 'zoom'] as const;

export const STUDIO_STUDENT_FORMAT_LABELS: Record<(typeof STUDIO_STUDENT_FORMATS)[number], string> = {
  nyc: 'NYC in-person',
  zoom: 'Zoom',
};

export const STUDIO_RELATED_RELATIONS = ['parent', 'student', 'related'] as const;

export const STUDIO_RELATED_LABELS: Record<(typeof STUDIO_RELATED_RELATIONS)[number], string> = {
  parent: 'Parent',
  student: 'Student',
  related: 'Related',
};

export const STUDIO_WARMTH = ['hot', 'warm', 'cool', 'cold'] as const;

export type StudioWarmth = (typeof STUDIO_WARMTH)[number];

export const STUDIO_WARMTH_LABELS: Record<StudioWarmth, string> = {
  hot: 'Hot',
  warm: 'Warm',
  cool: 'Cool',
  cold: 'Cold',
};

export const STUDIO_OFFLINE_METHODS = ['venmo', 'cash', 'zelle', 'other'] as const;

export type StudioOfflineMethod = (typeof STUDIO_OFFLINE_METHODS)[number];

export const STUDIO_OFFLINE_METHOD_LABELS: Record<StudioOfflineMethod, string> = {
  venmo: 'Venmo',
  cash: 'Cash',
  zelle: 'Zelle',
  other: 'Other',
};

export const STUDIO_PAY_LINK_LABELS: Record<string, string> = {
  '30min': '30-minute lesson',
  '60min': '60-minute lesson',
};

export function formatUsdFromCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function careerRecencyLabel(day: string, now = new Date()): string {
  const text = String(day || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return 'No date yet';
  const then = Date.UTC(Number(text.slice(0, 4)), Number(text.slice(5, 7)) - 1, Number(text.slice(8, 10)));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.floor((today - then) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) {
    const months = Math.max(1, Math.floor(days / 30));
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }
  const years = Math.max(1, Math.floor(days / 365));
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

export function warmthLabel(value: string): string {
  return STUDIO_WARMTH_LABELS[value as StudioWarmth] || '';
}

export const studioPeopleNotes = {
  path: '/studio/people',
  title: 'People',
  summary:
    'Authorized Studio users can add students, parents, agents, casting contacts, and alumni — with notes, related-person links, student lifetime value, and agent career value. Sign-in alone is not enough; People requires the People role or an explicit people permission. The list is 10 per page, sorted by last name then first. There is no Gemini tool that writes People or charges a card; changes happen on this screen only.',
};

/**
 * Detail URL for a contact. Ids live in Table Storage and are unknown at
 * `astro build` (`output: 'static'`), so this is a query-id on a static page
 * rather than `src/pages/studio/people/[id].astro`.
 */
export function studioPersonPath(id: string): string {
  return `/studio/people/person?id=${encodeURIComponent(id)}`;
}

export function personaLabel(persona: string): string {
  return STUDIO_PERSONA_LABELS[persona as StudioPersona] || persona;
}
