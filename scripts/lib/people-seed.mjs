/**
 * Fictional Studio People rows for local + staging pagination checks.
 * 15 rows = a page and a half at the default page size of 10.
 * Deploy-time only — not imported by Azure Functions.
 * Never log display names, emails, or phones.
 */

export const PEOPLE_SEED_COUNT = 15;

const SEED_NOTE =
  '[SEED] Fictional Studio People row for pagination. Safe to archive.';

/** Last names A–P so page 1 (10) and page 2 (5) are obvious after last-name sort. */
export const PEOPLE_SEEDS = [
  { id: 'seed-people-01', displayName: 'Jordan Alvarez', personas: ['student'] },
  { id: 'seed-people-02', displayName: 'Sam Bennett', personas: ['student'] },
  { id: 'seed-people-03', displayName: 'Riley Chen', personas: ['parent'] },
  {
    id: 'seed-people-04',
    displayName: 'Casey Donovan',
    personas: ['agent'],
    agentAgency: 'Example Reps',
    agentLastBooking: 'Cabaret',
    agentLastBookingYear: 2024,
    agentWarmth: 'warm',
    agentLastTouch: '2026-08-01',
    agentNextStep: 'Send updated reel',
  },
  {
    id: 'seed-people-05',
    displayName: 'Quinn Ellis',
    personas: ['casting'],
    castingLastRequest: 'Headshot and reel',
    castingLastRequestOn: '2026-07-15',
    castingWarmth: 'warm',
  },
  { id: 'seed-people-06', displayName: 'Avery Flores', personas: ['alumni'] },
  { id: 'seed-people-07', displayName: 'Morgan Grant', personas: ['student'] },
  { id: 'seed-people-08', displayName: 'Jamie Hughes', personas: ['parent'] },
  {
    id: 'seed-people-09',
    displayName: 'Taylor Ingram',
    personas: ['agent'],
    agentAgency: 'North Office',
    agentLastSubmission: 'Hadestown',
    agentWarmth: 'cool',
    agentLastTouch: '2026-03-15',
  },
  { id: 'seed-people-10', displayName: 'Drew Jacobs', personas: ['student'] },
  {
    id: 'seed-people-11',
    displayName: 'Cameron Kim',
    personas: ['casting'],
    castingLastRequest: 'Sides',
    castingLastRequestOn: '2026-05-01',
    castingWarmth: 'cold',
  },
  { id: 'seed-people-12', displayName: 'Reese Lopez', personas: ['alumni'] },
  { id: 'seed-people-13', displayName: 'Parker Nguyen', personas: ['student'] },
  { id: 'seed-people-14', displayName: 'Hayden Ortiz', personas: ['parent'] },
  {
    id: 'seed-people-15',
    displayName: 'Blake Patel',
    personas: ['agent'],
    agentLastBooking: 'Anastasia',
    agentLastBookingYear: 2025,
    agentWarmth: 'hot',
    agentLastTouch: '2026-08-20',
    agentNextStep: 'Confirm NYC dates',
  },
].map((row, index) => ({
  ...row,
  email: `${row.displayName.toLowerCase().replace(/\s+/g, '.')}@studio.test`,
  phone: `+1555010${String(index + 1).padStart(2, '0')}`,
  notes: SEED_NOTE,
}));

export async function ensurePeopleSeed(store) {
  let created = 0;
  for (const seed of PEOPLE_SEEDS) {
    const result = await store.ensureSeed(seed);
    if (result.created) created += 1;
  }
  return { created, total: PEOPLE_SEEDS.length };
}
