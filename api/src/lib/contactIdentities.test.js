import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryTableClient } from './contacts.js';
import { createContactIdentitiesStore } from './contactIdentities.js';

function store() {
  return createContactIdentitiesStore({ tableClient: new MemoryTableClient() });
}

test('attach and findByKey round-trip identity keys', async () => {
  const identities = store();
  const key = { provider: 'contact', issuer: 'https://issuer.example', subject: 'sub-1' };
  const attached = await identities.attach({ ...key, contactId: 'contact-a' });
  assert.equal(attached.contactId, 'contact-a');
  const found = await identities.findByKey(key);
  assert.equal(found?.contactId, 'contact-a');
});

test('attach rejects linking the same key to a different contact', async () => {
  const identities = store();
  const key = { provider: 'contact', issuer: 'https://issuer.example', subject: 'sub-2' };
  await identities.attach({ ...key, contactId: 'contact-a' });
  await assert.rejects(
    () => identities.attach({ ...key, contactId: 'contact-b' }),
    (err) => err.name === 'ContactIdentityConflictError',
  );
});

test('listByContactId returns all keys for a contact', async () => {
  const identities = store();
  await identities.attach({
    provider: 'contact',
    issuer: 'https://issuer.example',
    subject: 'sub-a',
    contactId: 'contact-a',
  });
  await identities.attach({
    provider: 'contact-google',
    issuer: 'https://issuer.example',
    subject: 'sub-b',
    contactId: 'contact-a',
  });
  const rows = await identities.listByContactId('contact-a');
  assert.equal(rows.length, 2);
});
