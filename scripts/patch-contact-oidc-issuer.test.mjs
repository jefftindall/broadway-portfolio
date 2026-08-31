import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeContactOidcIssuer,
  patchContactOidcIssuerFile,
} from './patch-contact-oidc-issuer.mjs';

const PREFIX_METADATA =
  'https://elysecontacts.ciamlogin.com/11111111-2222-3333-4444-555555555555/v2.0';
const CANONICAL_ISSUER =
  'https://11111111-2222-3333-4444-555555555555.ciamlogin.com/11111111-2222-3333-4444-555555555555/v2.0';

test('normalizeContactOidcIssuer accepts CIAM issuer URLs', () => {
  assert.equal(normalizeContactOidcIssuer(CANONICAL_ISSUER), CANONICAL_ISSUER);
  assert.equal(normalizeContactOidcIssuer(PREFIX_METADATA), PREFIX_METADATA);
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
                  clientIdSettingName: 'CONTACT_OIDC_CLIENT_ID',
                  clientCredential: {
                    clientSecretSettingName: 'CONTACT_OIDC_CLIENT_SECRET',
                  },
                  openIdConnectConfiguration: {
                    wellKnownOpenIdConfiguration:
                      'https://REPLACE_ME.ciamlogin.com/00000000-0000-0000-0000-000000000000/v2.0/.well-known/openid-configuration',
                  },
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

  patchContactOidcIssuerFile(configPath, CANONICAL_ISSUER);
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(
    parsed.auth.identityProviders.customOpenIdConnectProviders.contact.registration
      .openIdConnectConfiguration.wellKnownOpenIdConfiguration,
    `${CANONICAL_ISSUER}/.well-known/openid-configuration`,
  );
  assert.equal(
    parsed.auth.identityProviders.customOpenIdConnectProviders.contact.registration.openIdIssuer,
    undefined,
  );
});
