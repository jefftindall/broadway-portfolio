import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contactAccountsEnabledFromEnv,
  publicContactAccountConfig,
  publicContactAccountConfigFromEnv,
} from './contactAccountConfig.js';

test('publicContactAccountConfig returns enabled only', () => {
  assert.deepEqual(publicContactAccountConfig({ enabledFlag: 'true' }), { enabled: true });
  assert.deepEqual(publicContactAccountConfig({ enabledFlag: 'false' }), { enabled: false });
  assert.deepEqual(publicContactAccountConfig({}), { enabled: false });
});

test('publicContactAccountConfigFromEnv never returns extra fields', () => {
  const result = publicContactAccountConfigFromEnv({
    CONTACT_ACCOUNTS_ENABLED: 'true',
    CONTACT_OIDC_CLIENT_SECRET: 'must-not-leak',
  });
  assert.deepEqual(result, { enabled: true });
  assert.equal(JSON.stringify(result).includes('must-not-leak'), false);
});

test('contactAccountsEnabledFromEnv follows CONTACT_ACCOUNTS_ENABLED only', () => {
  assert.equal(contactAccountsEnabledFromEnv({ CONTACT_ACCOUNTS_ENABLED: 'true' }), true);
  assert.equal(contactAccountsEnabledFromEnv({ CONTACT_ACCOUNTS_ENABLED: 'false' }), false);
  assert.equal(contactAccountsEnabledFromEnv({ LESSON_PAYMENTS_ENABLED: 'true' }), false);
});
