import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeContactOidcIssuer,
  patchContactOidcIssuerFile,
} from './patch-contact-oidc-issuer.mjs';

const SAMPLE =
  'https://elysecontacts.ciamlogin.com/11111111-2222-3333-4444-555555555555/v2.0';

test('normalizeContactOidcIssuer accepts CIAM issuer URLs', () => {
  assert.equal(normalizeContactOidcIssuer(SAMPLE), SAMPLE);
});

test('normalizeContactOidcIssuer rejects placeholders and bad hosts', () => {
  assert.throws(() => normalizeContactOidcIssuer('REPLACE_ME'));
  assert.throws(() => normalizeContactOidcIssuer('http://evil.example/v2.0'));
  assert.throws(() => normalizeContactOidcIssuer('https://login.microsoftonline.com/common/v2.0'));
});

test('patchContactOidcIssuerFile updates customOpenIdConnectProviders.contact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contact-oidc-'));
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
                  openIdIssuer:
                    'https://REPLACE_ME.ciamlogin.com/00000000-0000-0000-0000-000000000000/v2.0',
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

  patchContactOidcIssuerFile(configPath, SAMPLE);
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(
    parsed.auth.identityProviders.customOpenIdConnectProviders.contact.registration.openIdIssuer,
    SAMPLE,
  );
});
