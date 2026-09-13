import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryTableClient, createContactsStore } from './contacts.js';
import { createContactIdentitiesStore } from './contactIdentities.js';
import { ContactArchivedError, ContactLinkError, ensureLinkedContact } from './contactLink.js';

function stores() {
  const table = new MemoryTableClient();
  return {
    contacts: createContactsStore({ tableClient: table }),
    identities: createContactIdentitiesStore({ tableClient: table }),
  };
}

function principal(overrides = {}) {
  return {
    identityProvider: 'contact',
    userId: 'sub-new',
    userDetails: 'student@example.com',
    claims: [
      { typ: 'email', val: 'student@example.com' },
      { typ: 'name', val: 'Riley Student' },
      { typ: 'iss', val: 'https://ciam.example' },
    ],
    ...overrides,
  };
}

test('ensureLinkedContact creates a contact and identity on first login', async () => {
  const { contacts, identities } = stores();
  const result = await ensureLinkedContact({
    contactsStore: contacts,
    identitiesStore: identities,
    principal: principal(),
  });
  assert.equal(result.created, true);
  assert.equal(result.contact.email, 'student@example.com');
  assert.equal(result.contact.personas.includes('student'), true);
  const identity = await identities.findByKey({
    provider: 'contact',
    issuer: 'https://ciam.example',
    subject: 'sub-new',
  });
  assert.equal(identity?.contactId, result.contact.id);
});

test('ensureLinkedContact links an existing email match without duplicating', async () => {
  const { contacts, identities } = stores();
  const existing = await contacts.create({
    displayName: 'Existing Student',
    email: 'match@example.com',
    personas: ['student'],
  });
  const result = await ensureLinkedContact({
    contactsStore: contacts,
    identitiesStore: identities,
    principal: principal({
      userId: 'sub-match',
      userDetails: 'match@example.com',
      claims: [
        { typ: 'email', val: 'match@example.com' },
        { typ: 'name', val: 'Existing Student' },
        { typ: 'iss', val: 'https://ciam.example' },
      ],
    }),
  });
  assert.equal(result.created, false);
  assert.equal(result.linked, true);
  assert.equal(result.contact.id, existing.id);
});

test('ensureLinkedContact rejects archived contacts', async () => {
  const { contacts, identities } = stores();
  const archived = await contacts.create({
    displayName: 'Archived Student',
    email: 'archived@example.com',
    personas: ['student'],
  });
  await contacts.archive(archived.id, true);
  await assert.rejects(
    () =>
      ensureLinkedContact({
        contactsStore: contacts,
        identitiesStore: identities,
        principal: principal({
          userId: 'sub-archived',
          userDetails: 'archived@example.com',
          claims: [
            { typ: 'email', val: 'archived@example.com' },
            { typ: 'iss', val: 'https://ciam.example' },
          ],
        }),
      }),
    ContactArchivedError,
  );
});

test('ensureLinkedContact rejects duplicate active email matches', async () => {
  const table = new MemoryTableClient();
  const contacts = createContactsStore({ tableClient: table });
  const identities = createContactIdentitiesStore({ tableClient: table });
  await contacts.create({
    displayName: 'One',
    email: 'dupe@example.com',
    personas: ['student'],
  });
  await table.createEntity({
    partitionKey: 'people',
    rowKey: 'seed-dupe-02',
    displayName: 'Two',
    email: 'dupe@example.com',
    emailKey: 'dupe@example.com',
    personasJson: '["student"]',
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await assert.rejects(
    () =>
      ensureLinkedContact({
        contactsStore: contacts,
        identitiesStore: identities,
        principal: principal({
          userId: 'sub-dupe',
          userDetails: 'dupe@example.com',
          claims: [{ typ: 'email', val: 'dupe@example.com' }, { typ: 'iss', val: 'https://ciam.example' }],
        }),
      }),
    ContactLinkError,
  );
});
