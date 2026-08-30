import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignSwRoles,
  CONTACT_IDENTITY_PROVIDER,
  CONTACT_SWA_ROLE,
  providerKindForLog,
  STUDIO_IDENTITY_PROVIDER,
  STUDIO_SWA_ROLE,
} from './authRoles.js';

test('assignSwRoles maps workforce AAD to studio only', () => {
  assert.deepEqual(assignSwRoles({ identityProvider: 'aad' }), [STUDIO_SWA_ROLE]);
  assert.deepEqual(assignSwRoles({ identityProvider: 'AAD' }), [STUDIO_SWA_ROLE]);
});

test('assignSwRoles maps External ID contact provider to contact only', () => {
  assert.deepEqual(assignSwRoles({ identityProvider: CONTACT_IDENTITY_PROVIDER }), [
    CONTACT_SWA_ROLE,
  ]);
});

test('assignSwRoles never assigns both roles', () => {
  for (const provider of ['aad', CONTACT_IDENTITY_PROVIDER, 'google', '']) {
    const roles = assignSwRoles({ identityProvider: provider });
    assert.equal(roles.includes(STUDIO_SWA_ROLE) && roles.includes(CONTACT_SWA_ROLE), false);
  }
});

test('assignSwRoles returns empty for unknown providers', () => {
  assert.deepEqual(assignSwRoles({ identityProvider: 'github' }), []);
  assert.deepEqual(assignSwRoles({}), []);
});

test('providerKindForLog never includes user details', () => {
  assert.equal(
    providerKindForLog({
      identityProvider: STUDIO_IDENTITY_PROVIDER,
      userDetails: 'secret@example.com',
    }),
    'workforce_aad',
  );
  assert.equal(providerKindForLog({ identityProvider: CONTACT_IDENTITY_PROVIDER }), 'external_id_contact');
  assert.equal(providerKindForLog({}), 'unknown');
});
