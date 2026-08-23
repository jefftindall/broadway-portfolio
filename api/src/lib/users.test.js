import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryTableClient } from './contacts.js';
import { PERMISSION, ROLE, hasPermission } from './permissions.js';
import {
  AccessValidationError,
  createUsersStore,
  identityFromInput,
  normalizeUserInput,
  profileMatchesCandidates,
} from './users.js';

function store() {
  return createUsersStore({ tableClient: new MemoryTableClient() });
}

test('identityFromInput accepts email, GUID, or userDetails', () => {
  assert.deepEqual(identityFromInput({ identity: 'coach@example.com' }), {
    userId: '',
    userDetails: 'coach@example.com',
    emails: ['coach@example.com'],
  });
  const guid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  assert.equal(identityFromInput({ identity: guid }).userId, guid);
  assert.equal(identityFromInput({ identity: 'aad-upn' }).userDetails, 'aad-upn');
});

test('normalizeUserInput requires an identity on create', () => {
  assert.throws(() => normalizeUserInput({ roles: [ROLE.PEOPLE] }), AccessValidationError);
  const ok = normalizeUserInput({
    identity: 'assistant@example.com',
    roles: [ROLE.PEOPLE],
  });
  assert.deepEqual(ok.roles, [ROLE.PEOPLE]);
  assert.ok(ok.emails.includes('assistant@example.com'));
});

test('normalizeUserInput rejects unknown roles and permissions without echoing them', () => {
  try {
    normalizeUserInput({ identity: 'a@b.c', roles: ['superadmin'] });
    assert.fail('expected validation error');
  } catch (err) {
    assert.equal(err.name, 'AccessValidationError');
    assert.equal(err.message.includes('superadmin'), false);
  }
});

test('users store create/list/update and principal match', async () => {
  const users = store();
  const created = await users.create({
    identity: 'assistant@example.com',
    roles: [ROLE.PEOPLE],
  });
  assert.equal(created.status, 'active');
  assert.equal(hasPermission(created.permissions, PERMISSION.PEOPLE_WRITE), true);
  assert.equal(hasPermission(created.permissions, PERMISSION.CONTENT_PUBLISH), false);
  assert.equal(Object.hasOwn(created, 'crmOwnerKey'), false);

  const listed = await users.list();
  assert.equal(listed.length, 1);

  const matched = await users.findByPrincipal(
    {},
    ['oid-guest', 'assistant@example.com'],
  );
  assert.equal(matched.id, created.id);

  const updated = await users.update(created.id, { roles: [ROLE.PEOPLE_READER] });
  assert.equal(hasPermission(updated.permissions, PERMISSION.PEOPLE_WRITE), false);
  assert.equal(hasPermission(updated.permissions, PERMISSION.PEOPLE_READ), true);
});

test('ensureOwnerFromAllowlist is idempotent and grants owner', async () => {
  const users = store();
  const first = await users.ensureOwnerFromAllowlist({
    userId: 'oid-elyse',
    userDetails: 'elyse@example.com',
    emails: ['elyse@example.com'],
  });
  assert.deepEqual(first.roles, [ROLE.OWNER]);
  assert.equal(hasPermission(first.permissions, PERMISSION.CONTENT_PUBLISH), true);
  assert.equal(hasPermission(first.permissions, PERMISSION.USERS_MANAGE), true);
  const second = await users.ensureOwnerFromAllowlist({
    userId: 'oid-elyse',
    userDetails: 'elyse@example.com',
  });
  assert.equal(second.id, first.id);
  const listed = await users.list();
  assert.equal(listed.length, 1);
});

test('profileMatchesCandidates is case-insensitive on stored identities', () => {
  assert.equal(
    profileMatchesCandidates(
      { userId: 'OID-ELYSE', userDetails: '', emails: ['Elyse@Example.com'] },
      ['oid-elyse'],
    ),
    true,
  );
  assert.equal(
    profileMatchesCandidates(
      { userId: 'oid-elyse', userDetails: '', emails: [] },
      ['oid-guest'],
    ),
    false,
  );
});
