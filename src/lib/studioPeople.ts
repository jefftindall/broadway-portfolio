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

export const studioPeopleNotes = {
  path: '/studio/people',
  title: 'People',
  summary:
    'Authorized Studio users can add students, parents, agents, casting contacts, and alumni — with notes and related-person links. Sign-in alone is not enough; People requires the People role or an explicit people permission. The list is 10 per page, sorted by last name then first. There is no Gemini tool that writes People; changes happen on this screen only.',
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
