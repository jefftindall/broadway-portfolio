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
    'Signed-in Studio users can add students, parents, agents, casting contacts, and alumni — with notes and related-person links. The list is 10 per page, sorted by last name then first. Publishing access is not required. There is no Gemini tool that writes People; changes happen on this screen only.',
};

export function personaLabel(persona: string): string {
  return STUDIO_PERSONA_LABELS[persona as StudioPersona] || persona;
}
