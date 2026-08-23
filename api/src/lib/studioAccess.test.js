import assert from 'node:assert/strict';
import test from 'node:test';
import { identityCandidates } from './auth.js';
import { MemoryTableClient } from './contacts.js';
import { PERMISSION, ROLE, hasPermission } from './permissions.js';
import { publisherGate, resolveStudioAccess, sessionPayload } from './studioAccess.js';
import { createUsersStore } from './users.js';

function principal(overrides = {}) {
  return {
    userId: 'oid-elyse',
    userDetails: 'elyse@example.com',
    identityProvider: 'aad',
    claims: [],
    ...overrides,
  };
}

function requestWithPrincipal(value) {
  const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
  return {
    headers: new Map([['x-ms-client-principal', encoded]]),
  };
}

const emptyRequest = { headers: new Map() };

function withEnv(vars, fn) {
  const prev = {};
  for (const [key, value] of Object.entries(vars)) {
    prev[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  return Promise.resolve()
    .then(fn)
    .finally(restore);
}

test('identityCandidates include userId, userDetails, email claims, and provider:id', () => {
  const keys = identityCandidates(
    principal({
      claims: [{ typ: 'email', val: 'coach@example.com' }],
    }),
  );
  assert.ok(keys.includes('oid-elyse'));
  assert.ok(keys.includes('elyse@example.com'));
  assert.ok(keys.includes('coach@example.com'));
  assert.ok(keys.includes('aad:oid-elyse'));
});

test('allowlisted user without a profile is migrated to a stored Super Administrator profile', async () => {
  await withEnv(
    {
      AZURE_FUNCTIONS_ENVIRONMENT: undefined,
      ALLOWED_USER_IDS: 'oid-elyse,elyse@example.com',
    },
    async () => {
      const users = createUsersStore({ tableClient: new MemoryTableClient() });
      const first = await resolveStudioAccess(principal(), { usersStore: users });
      assert.equal(first.source, 'profile');
      assert.ok(first.profile?.id);
      assert.deepEqual(first.roles, [ROLE.OWNER]);
      assert.equal(hasPermission(first.permissions, PERMISSION.PEOPLE_WRITE), true);
      assert.equal(hasPermission(first.permissions, PERMISSION.CONTENT_PUBLISH), true);

      const listed = await users.list();
      assert.equal(listed.length, 1);
      assert.deepEqual(listed[0].roles, [ROLE.OWNER]);

      const afterAllowlistRemoved = await withEnv({ ALLOWED_USER_IDS: '' }, async () =>
        resolveStudioAccess(principal(), { usersStore: users }),
      );
      assert.equal(afterAllowlistRemoved.source, 'profile');
      assert.equal(hasPermission(afterAllowlistRemoved.permissions, PERMISSION.CONTENT_PUBLISH), true);
    },
  );
});

test('signed-in user with no profile and no allowlist has no catalog permissions', async () => {
  await withEnv(
    {
      AZURE_FUNCTIONS_ENVIRONMENT: undefined,
      ALLOWED_USER_IDS: 'oid-elyse',
    },
    async () => {
      const guest = principal({ userId: 'oid-guest', userDetails: 'jeff@example.com' });
      const access = await resolveStudioAccess(guest, {
        usersStore: createUsersStore({ tableClient: new MemoryTableClient() }),
      });
      assert.equal(access.signedIn, true);
      assert.equal(access.source, 'authenticated');
      assert.equal(access.permissions.length, 0);
      assert.equal(hasPermission(access.permissions, PERMISSION.PEOPLE_READ), false);
    },
  );
});

test('people role profile can manage CRM without publish', async () => {
  await withEnv(
    {
      AZURE_FUNCTIONS_ENVIRONMENT: undefined,
      ALLOWED_USER_IDS: 'oid-elyse',
    },
    async () => {
      const users = createUsersStore({ tableClient: new MemoryTableClient() });
      await users.create({
        identity: 'assistant@example.com',
        userId: 'oid-assistant',
        roles: [ROLE.PEOPLE],
      });
      const access = await resolveStudioAccess(
        principal({
          userId: 'oid-assistant',
          userDetails: 'assistant@example.com',
        }),
        { usersStore: users },
      );
      assert.equal(access.source, 'profile');
      assert.equal(hasPermission(access.permissions, PERMISSION.PEOPLE_WRITE), true);
      assert.equal(hasPermission(access.permissions, PERMISSION.CONTENT_PUBLISH), false);
    },
  );
});

test('extraPermissions grant a discrete capability without a role', async () => {
  await withEnv(
    {
      AZURE_FUNCTIONS_ENVIRONMENT: undefined,
      ALLOWED_USER_IDS: 'oid-elyse',
    },
    async () => {
      const users = createUsersStore({ tableClient: new MemoryTableClient() });
      await users.create({
        identity: 'reader@example.com',
        extraPermissions: [PERMISSION.PEOPLE_READ],
      });
      const access = await resolveStudioAccess(
        principal({ userId: 'oid-reader', userDetails: 'reader@example.com' }),
        { usersStore: users },
      );
      assert.deepEqual(access.permissions, [PERMISSION.PEOPLE_READ]);
    },
  );
});

test('disabled profile grants nothing even when allowlisted', async () => {
  await withEnv(
    {
      AZURE_FUNCTIONS_ENVIRONMENT: undefined,
      ALLOWED_USER_IDS: 'oid-elyse',
    },
    async () => {
      const users = createUsersStore({ tableClient: new MemoryTableClient() });
      await users.create({
        userId: 'oid-elyse',
        identity: 'elyse@example.com',
        roles: [ROLE.OWNER],
        status: 'disabled',
      });
      const access = await resolveStudioAccess(principal(), { usersStore: users });
      assert.equal(access.source, 'profile_disabled');
      assert.equal(access.permissions.length, 0);
    },
  );
});

test('profile deniedPermissions strip people.write from owner', async () => {
  await withEnv(
    {
      AZURE_FUNCTIONS_ENVIRONMENT: undefined,
      ALLOWED_USER_IDS: '',
    },
    async () => {
      const users = createUsersStore({ tableClient: new MemoryTableClient() });
      await users.create({
        userId: 'oid-elyse',
        roles: [ROLE.OWNER],
        deniedPermissions: [PERMISSION.PEOPLE_WRITE],
      });
      const access = await resolveStudioAccess(principal(), { usersStore: users });
      assert.equal(hasPermission(access.permissions, PERMISSION.PEOPLE_WRITE), false);
      assert.equal(hasPermission(access.permissions, PERMISSION.CONTENT_PUBLISH), true);
    },
  );
});

test('publisherGate is the content.publish permission, not a separate allowlist check', async () => {
  await withEnv(
    {
      AZURE_FUNCTIONS_ENVIRONMENT: undefined,
      ALLOWED_USER_IDS: 'oid-elyse',
    },
    async () => {
      const users = createUsersStore({ tableClient: new MemoryTableClient() });
      await users.create({
        identity: 'assistant@example.com',
        userId: 'oid-assistant',
        extraPermissions: [PERMISSION.CONTENT_PUBLISH],
      });
      const publishOnly = await publisherGate(
        requestWithPrincipal(
          principal({ userId: 'oid-assistant', userDetails: 'assistant@example.com' }),
        ),
        { usersStore: users },
      );
      assert.equal(publishOnly.allowed, true);
      assert.equal(hasPermission(publishOnly.access.permissions, PERMISSION.PEOPLE_READ), false);

      const peopleOnly = createUsersStore({ tableClient: new MemoryTableClient() });
      await peopleOnly.create({
        identity: 'crm@example.com',
        userId: 'oid-crm',
        roles: [ROLE.PEOPLE],
      });
      const peopleGate = await publisherGate(
        requestWithPrincipal(principal({ userId: 'oid-crm', userDetails: 'crm@example.com' })),
        { usersStore: peopleOnly },
      );
      assert.equal(peopleGate.allowed, false);
      assert.equal(hasPermission(peopleGate.access.permissions, PERMISSION.PEOPLE_WRITE), true);
    },
  );
});

test('publisherGate skips authorization only in Development', async () => {
  await withEnv(
    {
      AZURE_FUNCTIONS_ENVIRONMENT: 'Development',
      ALLOWED_USER_IDS: '',
    },
    async () => {
      const gate = await publisherGate(emptyRequest);
      assert.equal(gate.allowed, true);
      assert.equal(gate.reason, 'development');
      assert.equal(hasPermission(gate.access.permissions, PERMISSION.PEOPLE_WRITE), true);
    },
  );
});

test('sessionPayload authorized means content.publish, not signed-in', async () => {
  await withEnv(
    {
      AZURE_FUNCTIONS_ENVIRONMENT: undefined,
      ALLOWED_USER_IDS: '',
    },
    async () => {
      const users = createUsersStore({ tableClient: new MemoryTableClient() });
      await users.create({
        identity: 'crm@example.com',
        userId: 'oid-crm',
        roles: [ROLE.PEOPLE],
      });
      const access = await resolveStudioAccess(
        principal({ userId: 'oid-crm', userDetails: 'crm@example.com' }),
        { usersStore: users },
      );
      const payload = sessionPayload(access, { correlationId: 'corr-people' });
      assert.equal(payload.signedIn, true);
      assert.equal(payload.authorized, false);
      assert.ok(payload.permissions.includes(PERMISSION.PEOPLE_WRITE));
      assert.equal(payload.correlationId, undefined);

      const guest = await resolveStudioAccess(
        principal({ userId: 'oid-guest', userDetails: 'jeff@example.com' }),
        { usersStore: users },
      );
      const denied = sessionPayload(guest, { correlationId: 'corr-none' });
      assert.equal(denied.authorized, false);
      assert.deepEqual(denied.permissions, []);
      assert.equal(denied.correlationId, 'corr-none');
    },
  );
});

test('allowlisted caller without a users store still gets in-memory owner until profiles apply', async () => {
  await withEnv(
    {
      AZURE_FUNCTIONS_ENVIRONMENT: undefined,
      ALLOWED_USER_IDS: 'oid-elyse',
      STUDIO_CRM_STORAGE_CONNECTION_STRING: '',
    },
    async () => {
      const access = await resolveStudioAccess(principal());
      assert.equal(access.source, 'allowlist');
      assert.equal(hasPermission(access.permissions, PERMISSION.CONTENT_PUBLISH), true);
      assert.equal(hasPermission(access.permissions, PERMISSION.PEOPLE_WRITE), true);
    },
  );
});
