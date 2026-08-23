import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getClientPrincipal,
  identityCandidates,
  isAuthorizedPublisher,
  isSignedInStudioUser,
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

test('identityCandidates include userId, userDetails, email, and provider:id', () => {
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

test('getClientPrincipal returns null for missing or invalid headers', () => {
  assert.equal(getClientPrincipal(emptyRequest), null);
  assert.equal(
    getClientPrincipal({ headers: new Map([['x-ms-client-principal', 'not-base64-json']]) }),
    null,
  );
});
