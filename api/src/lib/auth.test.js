import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getClientPrincipal,
  isAuthorizedPublisher,
  isDevelopmentEnvironment,
  isSignedInStudioUser,
  publisherGate,
  studioOwnerKey,
} from './auth.js';

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

test('isAuthorizedPublisher is false without a principal', () => {
  assert.equal(isAuthorizedPublisher(null), false);
  assert.equal(isAuthorizedPublisher(undefined), false);
});

test('isAuthorizedPublisher is false when the allowlist is empty', () => {
  const prev = process.env.ALLOWED_USER_IDS;
  process.env.ALLOWED_USER_IDS = '';
  try {
    assert.equal(isAuthorizedPublisher(principal()), false);
  } finally {
    if (prev === undefined) delete process.env.ALLOWED_USER_IDS;
    else process.env.ALLOWED_USER_IDS = prev;
  }
});

test('signed-in is not the same as authorized to publish', () => {
  const prev = process.env.ALLOWED_USER_IDS;
  process.env.ALLOWED_USER_IDS = 'oid-elyse,elyse@example.com';
  try {
    const guest = principal({
      userId: 'oid-guest',
      userDetails: 'jeff@example.com',
    });
    assert.equal(isSignedInStudioUser(guest), true);
    assert.equal(isAuthorizedPublisher(guest), false);
    assert.equal(isAuthorizedPublisher(principal()), true);
  } finally {
    if (prev === undefined) delete process.env.ALLOWED_USER_IDS;
    else process.env.ALLOWED_USER_IDS = prev;
  }
});

test('isAuthorizedPublisher matches userId, userDetails, email claim, or provider:id', () => {
  const prev = process.env.ALLOWED_USER_IDS;
  try {
    process.env.ALLOWED_USER_IDS = 'oid-elyse';
    assert.equal(isAuthorizedPublisher(principal({ userDetails: 'other@example.com' })), true);

    process.env.ALLOWED_USER_IDS = 'elyse@example.com';
    assert.equal(isAuthorizedPublisher(principal({ userId: 'other' })), true);

    process.env.ALLOWED_USER_IDS = 'coach@example.com';
    assert.equal(
      isAuthorizedPublisher(
        principal({
          userId: 'other',
          userDetails: 'other@example.com',
          claims: [{ typ: 'email', val: 'coach@example.com' }],
        }),
      ),
      true,
    );

    process.env.ALLOWED_USER_IDS = 'aad:oid-elyse';
    assert.equal(isAuthorizedPublisher(principal({ userDetails: 'other@example.com' })), true);
  } finally {
    if (prev === undefined) delete process.env.ALLOWED_USER_IDS;
    else process.env.ALLOWED_USER_IDS = prev;
  }
});

test('publisherGate denies missing or non-allowlisted callers outside Development', () => {
  const prevEnv = process.env.AZURE_FUNCTIONS_ENVIRONMENT;
  const prevAllow = process.env.ALLOWED_USER_IDS;
  delete process.env.AZURE_FUNCTIONS_ENVIRONMENT;
  process.env.ALLOWED_USER_IDS = 'oid-elyse';
  try {
    assert.equal(isDevelopmentEnvironment(), false);

    const missing = publisherGate(emptyRequest);
    assert.equal(missing.allowed, false);
    assert.equal(missing.principal, null);
    assert.ok(missing.correlationId);

    const guest = publisherGate(
      requestWithPrincipal(principal({ userId: 'oid-guest', userDetails: 'jeff@example.com' })),
    );
    assert.equal(guest.allowed, false);
    assert.equal(guest.principal.userId, 'oid-guest');

    const publisher = publisherGate(requestWithPrincipal(principal()));
    assert.equal(publisher.allowed, true);
    assert.equal(publisher.principal.userId, 'oid-elyse');
  } finally {
    if (prevEnv === undefined) delete process.env.AZURE_FUNCTIONS_ENVIRONMENT;
    else process.env.AZURE_FUNCTIONS_ENVIRONMENT = prevEnv;
    if (prevAllow === undefined) delete process.env.ALLOWED_USER_IDS;
    else process.env.ALLOWED_USER_IDS = prevAllow;
  }
});

test('publisherGate skips the allowlist only in Development', () => {
  const prevEnv = process.env.AZURE_FUNCTIONS_ENVIRONMENT;
  const prevAllow = process.env.ALLOWED_USER_IDS;
  process.env.AZURE_FUNCTIONS_ENVIRONMENT = 'Development';
  process.env.ALLOWED_USER_IDS = '';
  try {
    const gate = publisherGate(emptyRequest);
    assert.equal(gate.allowed, true);
    assert.equal(gate.reason, 'development');
  } finally {
    if (prevEnv === undefined) delete process.env.AZURE_FUNCTIONS_ENVIRONMENT;
    else process.env.AZURE_FUNCTIONS_ENVIRONMENT = prevEnv;
    if (prevAllow === undefined) delete process.env.ALLOWED_USER_IDS;
    else process.env.ALLOWED_USER_IDS = prevAllow;
  }
});

test('getClientPrincipal returns null for missing or invalid headers', () => {
  assert.equal(getClientPrincipal(emptyRequest), null);
  assert.equal(
    getClientPrincipal({ headers: new Map([['x-ms-client-principal', 'not-base64-json']]) }),
    null,
  );
});

test('studioOwnerKey is the signed-in userId and never a shared default in production', () => {
  const prevEnv = process.env.AZURE_FUNCTIONS_ENVIRONMENT;
  delete process.env.AZURE_FUNCTIONS_ENVIRONMENT;
  try {
    assert.equal(studioOwnerKey(principal()), 'oid-elyse');
    assert.throws(() => studioOwnerKey({}), { name: 'CrmUnauthorizedError' });
  } finally {
    if (prevEnv === undefined) delete process.env.AZURE_FUNCTIONS_ENVIRONMENT;
    else process.env.AZURE_FUNCTIONS_ENVIRONMENT = prevEnv;
  }
});
