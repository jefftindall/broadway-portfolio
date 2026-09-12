import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  flowManifestNeedsRemoteLookup,
  formatPlanAction,
  planBrandingSync,
  planIdentityProviderSync,
  planUserFlowSync,
  summarizePlan,
} from './lib/contact-ciam-diff.mjs';
import {
  buildAppleIdentityProviderBody,
  buildGoogleIdentityProviderBody,
  idpDesiredPublicFingerprint,
  idpPublicFingerprint,
  normalizeApplePrivateKey,
} from './lib/contact-ciam-idp.mjs';
import {
  brandingDesiredFingerprint,
  brandingLocalizationFingerprint,
  buildBrandingLocalizationPatch,
  normalizeBrandingSpec,
} from './lib/contact-ciam-branding.mjs';
import {
  loadContactCiamManifest,
  manifestContentHash,
  resolveContactCiamManifest,
  resolveManifestPlaceholders,
  stableJson,
} from './lib/contact-ciam-manifest.mjs';
import { isSecretReady } from './lib/contact-ciam-secrets.mjs';

test('resolveManifestPlaceholders resolves {{ENV_VAR}} tokens', () => {
  assert.equal(
    resolveManifestPlaceholders('{{CONTACT_OIDC_CLIENT_ID}}', { CONTACT_OIDC_CLIENT_ID: '961894e2-e231-4b01-8a13-56fa85cf0492' }),
    '961894e2-e231-4b01-8a13-56fa85cf0492',
  );
});

test('stableJson sorts keys for deterministic diffing', () => {
  assert.equal(stableJson({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}\n');
});

test('loadContactCiamManifest loads repo infra/contact-ciam files', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = loadContactCiamManifest(repoRoot, 'staging');
  assert.equal(manifest.environment, 'staging');
  assert.ok(manifest.flow);
  assert.equal(manifest.flow?.displayName, 'contact-signin-staging');
  assert.ok(manifest.idps.length >= 3);
  assert.ok(manifest.branding);
  assert.equal(manifest.branding?.enabled, true);
  assert.ok(manifest.branding?.spec);
});

test('manifestContentHash changes when a source file changes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ciam-manifest-'));
  const root = path.join(dir, 'infra', 'contact-ciam');
  fs.mkdirSync(path.join(root, 'flows'), { recursive: true });
  const flowPath = path.join(root, 'flows', 'staging.json');
  fs.writeFileSync(flowPath, '{"schemaVersion":1,"displayName":"a"}\n', 'utf8');
  const before = manifestContentHash(dir, [flowPath]);
  fs.writeFileSync(flowPath, '{"schemaVersion":1,"displayName":"b"}\n', 'utf8');
  const after = manifestContentHash(dir, [flowPath]);
  assert.notEqual(before, after);
});

test('flowManifestNeedsRemoteLookup is false until flow.spec exists', () => {
  assert.equal(
    flowManifestNeedsRemoteLookup({ schemaVersion: 1, enabled: true, displayName: 'contact-signin-staging' }),
    false,
  );
  assert.equal(
    flowManifestNeedsRemoteLookup({
      schemaVersion: 1,
      enabled: true,
      displayName: 'contact-signin-staging',
      spec: { onInteractiveAuthFlowStart: { isSignUpAllowed: true } },
    }),
    true,
  );
  assert.equal(flowManifestNeedsRemoteLookup({ schemaVersion: 1, enabled: false, displayName: 'x' }), false);
});

test('planUserFlowSync skips when spec missing (P1-008 gate)', () => {
  const actions = planUserFlowSync(
    { schemaVersion: 1, enabled: true, displayName: 'contact-signin-staging' },
    null,
    '961894e2-e231-4b01-8a13-56fa85cf0492',
  );
  assert.equal(actions.length, 1);
  assert.equal(actions[0].kind, 'skip');
  assert.match(String(actions[0].reason), /spec missing/);
});

test('planUserFlowSync plans create when spec present and remote missing', () => {
  const actions = planUserFlowSync(
    {
      schemaVersion: 1,
      enabled: true,
      displayName: 'contact-signin-staging',
      spec: { onInteractiveAuthFlowStart: { isSignUpAllowed: true } },
    },
    null,
    '961894e2-e231-4b01-8a13-56fa85cf0492',
  );
  assert.deepEqual(actions, [
    {
      kind: 'create',
      resource: 'userFlow',
      name: 'contact-signin-staging',
      details: { applicationClientId: '961894e2-e231-4b01-8a13-56fa85cf0492' },
    },
  ]);
});

test('planUserFlowSync noop when remote flow matches displayName', () => {
  const actions = planUserFlowSync(
    {
      schemaVersion: 1,
      enabled: true,
      displayName: 'contact-signin-staging',
      spec: { onInteractiveAuthFlowStart: { isSignUpAllowed: true } },
    },
    { id: 'flow-id-1', displayName: 'contact-signin-staging' },
    '961894e2-e231-4b01-8a13-56fa85cf0492',
  );
  assert.equal(actions[0].kind, 'noop');
});

test('planIdentityProviderSync skips disabled idps', () => {
  const actions = planIdentityProviderSync(
    [{ schemaVersion: 1, key: 'google', displayName: 'Google', enabled: false }],
    new Map(),
  );
  assert.equal(actions[0].kind, 'skip');
});

test('planIdentityProviderSync skips google when KV secrets not ready', () => {
  const actions = planIdentityProviderSync(
    [
      {
        schemaVersion: 1,
        key: 'google',
        displayName: 'Google',
        graphIdentityProviderId: 'Google-OAUTH',
        enabled: true,
        spec: {
          type: 'google',
          secrets: { clientId: 'CONTACT-IDP-GOOGLE-CLIENT-ID', clientSecret: 'CONTACT-IDP-GOOGLE-CLIENT-SECRET' },
        },
      },
    ],
    new Map(),
    new Map([
      [
        'google',
        { ready: false, values: {}, missing: ['CONTACT-IDP-GOOGLE-CLIENT-ID', 'CONTACT-IDP-GOOGLE-CLIENT-SECRET'] },
      ],
    ]),
  );
  assert.equal(actions[0].kind, 'skip');
  assert.match(String(actions[0].reason), /KV secrets not ready/);
});

test('planIdentityProviderSync noop builtin microsoft when remote exists', () => {
  const remote = new Map([['Microsoft-OAuth', { id: 'Microsoft-OAuth', displayName: 'Microsoft Account' }]]);
  const actions = planIdentityProviderSync(
    [
      {
        schemaVersion: 1,
        key: 'microsoft-personal',
        displayName: 'Microsoft personal',
        graphIdentityProviderId: 'Microsoft-OAuth',
        enabled: true,
        spec: { type: 'builtin' },
      },
    ],
    remote,
    new Map([['microsoft-personal', { ready: true, values: {}, missing: [] }]]),
  );
  assert.equal(actions[0].kind, 'noop');
});

test('planIdentityProviderSync plans update when google clientId drifts', () => {
  const remote = new Map([['Google-OAUTH', { id: 'Google-OAUTH', displayName: 'Google', clientId: 'old-id' }]]);
  const doc = {
    schemaVersion: 1,
    key: 'google',
    displayName: 'Google',
    graphIdentityProviderId: 'Google-OAUTH',
    enabled: true,
    spec: {
      type: 'google',
      secrets: { clientId: 'CONTACT-IDP-GOOGLE-CLIENT-ID', clientSecret: 'CONTACT-IDP-GOOGLE-CLIENT-SECRET' },
    },
  };
  const credentials = new Map([
    ['google', { ready: true, values: { clientId: 'new-id', clientSecret: 'secret' }, missing: [] }],
  ]);
  const details = new Map([['Google-OAUTH', { id: 'Google-OAUTH', clientId: 'old-id' }]]);
  const actions = planIdentityProviderSync([doc], remote, credentials, details);
  assert.equal(actions[0].kind, 'update');
});

test('planBrandingSync plans create when remote branding missing', () => {
  const actions = planBrandingSync(
    {
      schemaVersion: 1,
      enabled: true,
      spec: {
        backgroundColor: '#0e0d0c',
        signInPageText: 'Sign in to book voice lessons.',
        bannerLogoUrl: 'https://elysetindall.com/images/photos/brand-mark.png',
      },
    },
    null,
  );
  assert.equal(actions[0].kind, 'create');
});

test('planBrandingSync noop when localization matches desired fingerprint', () => {
  const spec = {
    backgroundColor: '#0e0d0c',
    signInPageText: 'Sign in to book voice lessons.',
    usernameHintText: 'Email address',
    bannerLogoUrl: 'https://elysetindall.com/images/photos/brand-mark.png',
  };
  const actions = planBrandingSync(
    { schemaVersion: 1, enabled: true, spec },
    {
      orgId: 'org-1',
      localization: {
        backgroundColor: '#0e0d0c',
        signInPageText: 'Sign in to book voice lessons.',
        usernameHintText: 'Email address',
        bannerLogoRelativeUrl: 'bannerLogo',
      },
    },
  );
  assert.equal(actions[0].kind, 'noop');
});

test('buildGoogleIdentityProviderBody uses socialIdentityProvider odata type', () => {
  const body = buildGoogleIdentityProviderBody(
    { displayName: 'Google' },
    { values: { clientId: 'google-client', clientSecret: 'google-secret' } },
  );
  assert.equal(body['@odata.type'], '#microsoft.graph.socialIdentityProvider');
  assert.equal(body.clientId, 'google-client');
  assert.equal(body.clientSecret, 'google-secret');
});

test('normalizeApplePrivateKey wraps raw p8 content', () => {
  const normalized = normalizeApplePrivateKey('abc123');
  assert.match(normalized, /BEGIN PRIVATE KEY/);
  assert.match(normalized, /abc123/);
});

test('buildAppleIdentityProviderBody maps team and service ids', () => {
  const body = buildAppleIdentityProviderBody(
    { displayName: 'Apple' },
    {
      values: {
        teamId: 'TEAM',
        serviceId: 'com.example.web',
        keyId: 'KEY',
        privateKey: 'abc123',
      },
    },
  );
  assert.equal(body['@odata.type'], '#microsoft.graph.appleManagedIdentityProvider');
  assert.equal(body.developerId, 'TEAM');
  assert.equal(body.serviceId, 'com.example.web');
  assert.equal(body.keyId, 'KEY');
});

test('branding patch includes ink background and sign-in copy', () => {
  const patch = buildBrandingLocalizationPatch(normalizeBrandingSpec({
    backgroundColor: '#0e0d0c',
    signInPageText: 'Sign in to book voice lessons.',
    usernameHintText: 'Email address',
  }));
  assert.equal(patch.backgroundColor, '#0e0d0c');
  assert.match(patch.signInPageText, /voice lessons/);
});

test('idp fingerprints detect clientId drift only on public fields', () => {
  const doc = {
    spec: { type: 'google' },
  };
  const desired = idpDesiredPublicFingerprint(doc, { values: { clientId: 'a', clientSecret: 'secret-1' } });
  const remote = idpPublicFingerprint(doc, { clientId: 'b' });
  assert.notEqual(desired, remote);
});

test('isSecretReady rejects REPLACE_ME and empty values', () => {
  assert.equal(isSecretReady('REPLACE_ME'), false);
  assert.equal(isSecretReady(''), false);
  assert.equal(isSecretReady('client-id-value'), true);
});

test('summarizePlan hides noop actions', () => {
  const summary = summarizePlan([
    { kind: 'noop', resource: 'userFlow', name: 'contact-signin-staging' },
    { kind: 'skip', resource: 'branding', name: 'theme', reason: 'later' },
  ]);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].kind, 'skip');
});

test('formatPlanAction includes resource identifiers only', () => {
  const line = formatPlanAction({
    kind: 'update',
    resource: 'userFlow',
    name: 'contact-signin-staging',
    details: { flowId: '0313cc37-d421-421d-857b-87804d61e33e', applicationClientId: '961894e2-e231-4b01-8a13-56fa85cf0492' },
  });
  assert.match(line, /UPDATE userFlow contact-signin-staging/);
  assert.match(line, /flowId=0313cc37-d421-421d-857b-87804d61e33e/);
  assert.match(line, /appId=961894e2-e231-4b01-8a13-56fa85cf0492/);
});

test('resolveContactCiamManifest resolves flow applicationClientId placeholder', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = loadContactCiamManifest(repoRoot, 'staging');
  const resolved = resolveContactCiamManifest(manifest, {
    CONTACT_OIDC_CLIENT_ID: '961894e2-e231-4b01-8a13-56fa85cf0492',
  });
  assert.equal(resolved.flow?.applicationClientId, '961894e2-e231-4b01-8a13-56fa85cf0492');
});

test('brandingDesiredFingerprint matches localization fingerprint for same values', () => {
  const spec = {
    backgroundColor: '#0e0d0c',
    signInPageText: 'Sign in to book voice lessons.',
    usernameHintText: 'Email address',
  };
  assert.equal(
    brandingDesiredFingerprint(spec),
    brandingLocalizationFingerprint(spec),
  );
});
