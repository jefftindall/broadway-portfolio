import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STUDIO_CONTACTS_PARTITION,
  createContactsStore,
  MemoryTableClient,
} from '../../api/src/lib/contacts.js';
import { PEOPLE_SEED_COUNT, PEOPLE_SEEDS, ensurePeopleSeed } from './people-seed.mjs';

test('people seed is a page and a half at 10 per page', () => {
  assert.equal(PEOPLE_SEED_COUNT, 15);
  assert.equal(PEOPLE_SEEDS.length, 15);
  assert.equal(PEOPLE_SEEDS[0].id, 'seed-people-01');
  assert.equal(PEOPLE_SEEDS[14].id, 'seed-people-15');
  assert.ok(PEOPLE_SEEDS.every((row) => row.email.endsWith('@studio.test')));
});

test('ensurePeopleSeed is idempotent and writes the shared People partition', async () => {
  const table = new MemoryTableClient();
  const crm = createContactsStore({ tableClient: table });
  const first = await ensurePeopleSeed(crm);
  assert.equal(first.created, 15);
  const second = await ensurePeopleSeed(crm);
  assert.equal(second.created, 0);
  const listed = await crm.list({ page: 1, pageSize: 10 });
  assert.equal(listed.total, 15);
  assert.equal(listed.contacts.length, 10);
  assert.equal(listed.totalPages, 2);
  const stored = [...table.entities.values()];
  assert.equal(stored.length, 15);
  assert.ok(stored.every((row) => row.partitionKey === STUDIO_CONTACTS_PARTITION));
});
