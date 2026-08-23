import assert from 'node:assert/strict';
import test from 'node:test';
import { createContactsStore, MemoryTableClient } from '../../api/src/lib/contacts.js';
import {
  PEOPLE_SEED_COUNT,
  PEOPLE_SEEDS,
  ensurePeopleSeed,
  parseOwnerList,
} from './people-seed.mjs';

test('people seed is a page and a half at 10 per page', () => {
  assert.equal(PEOPLE_SEED_COUNT, 15);
  assert.equal(PEOPLE_SEEDS.length, 15);
  assert.equal(PEOPLE_SEEDS[0].id, 'seed-people-01');
  assert.equal(PEOPLE_SEEDS[14].id, 'seed-people-15');
  assert.ok(PEOPLE_SEEDS.every((row) => row.email.endsWith('@studio.test')));
});

test('parseOwnerList drops placeholders and blanks', () => {
  assert.deepEqual(parseOwnerList('  , REPLACE_ME, ,dev, dev '), ['dev']);
  assert.deepEqual(parseOwnerList(''), []);
});

test('ensurePeopleSeed is idempotent and stays on one owner partition', async () => {
  const crm = createContactsStore({ tableClient: new MemoryTableClient() });
  const first = await ensurePeopleSeed(crm, 'dev');
  assert.equal(first.created, 15);
  const second = await ensurePeopleSeed(crm, 'dev');
  assert.equal(second.created, 0);
  const listed = await crm.list('dev', { page: 1, pageSize: 10 });
  assert.equal(listed.total, 15);
  assert.equal(listed.contacts.length, 10);
  assert.equal(listed.totalPages, 2);
  assert.equal((await crm.list('other', { page: 1 })).total, 0);
});
