import assert from 'node:assert/strict';
import test from 'node:test';
import { isStaleAgent, listStaleAgentTasks, agentStaleDaysFromEnv } from './agentTasks.js';
import { MemoryTableClient, createContactsStore, normalizeContactInput } from './contacts.js';

test('agentStaleDaysFromEnv defaults to 90', () => {
  assert.equal(agentStaleDaysFromEnv({}), 90);
  assert.equal(agentStaleDaysFromEnv({ STUDIO_AGENT_STALE_DAYS: '45' }), 45);
});

test('isStaleAgent uses last touch and persona', () => {
  const now = new Date('2026-08-24T12:00:00Z');
  const fresh = {
    archived: false,
    personas: ['agent'],
    agentLastTouch: '2026-08-01',
    createdAt: '2024-01-01T00:00:00.000Z',
  };
  const stale = { ...fresh, agentLastTouch: '2026-01-01' };
  assert.equal(isStaleAgent(fresh, 90, now), false);
  assert.equal(isStaleAgent(stale, 90, now), true);
  assert.equal(isStaleAgent({ ...fresh, personas: ['student'] }, 90, now), false);
});

test('listStaleAgentTasks returns tasks without emailing', async () => {
  const table = new MemoryTableClient();
  const store = createContactsStore({ tableClient: table });
  await store.create(
    normalizeContactInput({
      displayName: 'Stale Agent',
      personas: ['agent'],
      email: 'stale@example.com',
      agentLastTouch: '2025-01-01',
    }),
  );
  await store.create(
    normalizeContactInput({
      displayName: 'Fresh Agent',
      personas: ['agent'],
      email: 'fresh@example.com',
      agentLastTouch: '2026-08-01',
    }),
  );
  const result = await listStaleAgentTasks(store, {
    staleDays: 90,
    now: new Date('2026-08-24T12:00:00Z'),
  });
  assert.equal(result.total, 1);
  assert.equal(result.tasks[0].contactId.length > 0, true);
  assert.match(result.tasks[0].task, /submission|touch/i);
});
