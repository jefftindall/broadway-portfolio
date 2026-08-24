/**
 * Stale agent follow-up tasks for Studio Career (STUDIO-P4-004).
 * Tasks only — never auto-email agents.
 */

function careerRecencyLabel(day, now = new Date()) {
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

export function agentStaleDaysFromEnv(env = process.env) {
  const raw = Number.parseInt(String(env.STUDIO_AGENT_STALE_DAYS || '90'), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 90;
}

function daysSince(day, now = new Date()) {
  const text = String(day || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const then = Date.UTC(Number(text.slice(0, 4)), Number(text.slice(5, 7)) - 1, Number(text.slice(8, 10)));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - then) / 86_400_000);
}

export function isStaleAgent(contact, staleDays, now = new Date()) {
  if (!contact || contact.archived) return false;
  if (!(contact.personas || []).includes('agent')) return false;
  const touch = String(contact.agentLastTouch || '').trim();
  const created = String(contact.createdAt || '').slice(0, 10);
  const basis = touch || created;
  const elapsed = daysSince(basis, now);
  if (elapsed === null) return true;
  return elapsed >= staleDays;
}

export function buildAgentTask(contact, staleDays, now = new Date()) {
  const touch = String(contact.agentLastTouch || '').trim();
  const recency = touch ? careerRecencyLabel(touch, now) : 'No last-touch date';
  const agency = String(contact.agentAgency || '').trim();
  const next = String(contact.agentNextStep || '').trim();
  return {
    contactId: contact.id,
    displayName: contact.displayName,
    agency,
    agentLastTouch: touch,
    recency,
    agentNextStep: next,
    staleDays,
    task: next || 'Log a submission or update last touch on this agent.',
  };
}

export async function listStaleAgentTasks(contactsStore, { staleDays, now = new Date() } = {}) {
  const threshold = staleDays ?? agentStaleDaysFromEnv();
  const listed = await contactsStore.list({
    persona: 'agent',
    directory: true,
  });
  const tasks = (listed.contacts || [])
    .filter((row) => isStaleAgent(row, threshold, now))
    .map((row) => buildAgentTask(row, threshold, now))
    .sort((a, b) => String(a.agentLastTouch).localeCompare(String(b.agentLastTouch)));
  return { tasks, staleDays: threshold, total: tasks.length };
}
