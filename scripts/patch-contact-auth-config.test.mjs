import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  flagEnabled,
  patchContactAuthConfig,
  patchContactAuthConfigFile,
} from './patch-contact-auth-config.mjs';

test('flagEnabled accepts common truthy strings', () => {
  assert.equal(flagEnabled('true'), true);
  assert.equal(flagEnabled('TRUE'), true);
  assert.equal(flagEnabled('1'), true);
  assert.equal(flagEnabled('false'), false);
  assert.equal(flagEnabled(''), false);
});

test('patchContactAuthConfigFile removes contact provider when disabled', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contact-auth-'));
  const configPath = path.join(dir, 'staticwebapp.config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        auth: {
          identityProviders: {
            azureActiveDirectory: { registration: { openIdIssuer: 'https://example.test/v2.0' } },
            customOpenIdConnectProviders: {
              contact: {
                registration: {
                  openIdIssuer: 'https://tenant.ciamlogin.com/tenant/v2.0',
                },
              },
            },
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const result = patchContactAuthConfigFile(configPath, { contactAccountsEnabled: false });
  assert.equal(result.removedContactProvider, true);
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(
    parsed.auth.identityProviders.customOpenIdConnectProviders,
    undefined,
  );
  assert.ok(parsed.auth.identityProviders.azureActiveDirectory);
});

test('patchContactAuthConfig keeps contact provider when enabled', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contact-auth-'));
  const configPath = path.join(dir, 'staticwebapp.config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        auth: {
          identityProviders: {
            customOpenIdConnectProviders: {
              contact: {
                registration: {
                  openIdIssuer: 'https://tenant.ciamlogin.com/tenant/v2.0',
                },
              },
            },
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  patchContactAuthConfig(dir, { contactAccountsEnabled: true });
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(
    parsed.auth.identityProviders.customOpenIdConnectProviders.contact.registration.openIdIssuer,
    'https://tenant.ciamlogin.com/tenant/v2.0',
  );
});
