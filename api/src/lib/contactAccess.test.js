import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTACT_SWA_ROLE } from './authRoles.js';
import { contactGate, resolveContactPrincipal } from './contactAccess.js';

function encodePrincipal(principal) {
  return Buffer.from(JSON.stringify(principal), 'utf8').toString('base64');
}

function requestWithPrincipal(principal, env = {}) {
  return {
    headers: new Map([['x-ms-client-principal', encodePrincipal(principal)]]),
    env,
  };
}

test('contactGate allows External ID principals with contact role', async () => {
  const gate = await contactGate(
    requestWithPrincipal({
      identityProvider: 'contact',
      userId: 'sub-1',
      userRoles: [CONTACT_SWA_ROLE],
    }),
    { env: { CONTACT_ACCOUNTS_ENABLED: 'true', AZURE_FUNCTIONS_ENVIRONMENT: 'Production' } },
  );
  assert.equal(gate.allowed, true);
});

test('contactGate rejects workforce principals', async () => {
  const gate = await contactGate(
    requestWithPrincipal({
      identityProvider: 'aad',
      userId: 'oid-1',
      userRoles: ['studio'],
    }),
    { env: { CONTACT_ACCOUNTS_ENABLED: 'true', AZURE_FUNCTIONS_ENVIRONMENT: 'Production' } },
  );
  assert.equal(gate.allowed, false);
});

test('resolveContactPrincipal uses CONTACT_DEV_PRINCIPAL in Development', () => {
  const env = {
    AZURE_FUNCTIONS_ENVIRONMENT: 'Development',
    CONTACT_DEV_PRINCIPAL: JSON.stringify({
      identityProvider: 'contact',
      userId: 'dev-sub',
      userDetails: 'dev@example.com',
    }),
  };
  const principal = resolveContactPrincipal({ headers: new Map() }, env);
  assert.equal(principal?.userId, 'dev-sub');
});
