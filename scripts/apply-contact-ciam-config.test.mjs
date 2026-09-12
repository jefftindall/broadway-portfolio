import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  formatPlanAction,
  planBrandingSync,
  planIdentityProviderSync,
  planUserFlowSync,
  summarizePlan,
} from './lib/contact-ciam-diff.mjs';
import {
  loadContactCiamManifest,
  manifestContentHash,
  resolveContactCiamManifest,
  resolveManifestPlaceholders,
  stableJson,
} from './lib/contact-ciam-manifest.mjs';

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

test('planUserFlowSync skips when spec missing (P1-008 gate)', () => {
  const actions = planUserFlowSync(
    { schemaVersion: 1, enabled: true, displayName: 'contact-signin-staging' },
    null,
    '961894e2-e231-4b01-8a13-56fa85cf0492',
  );
  assert.equal(actions.length, 1);
  assert.equal(actions[0].kind, 'skip');
  assert.match(String(actions[0].reason), /P1-008/);
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

test('planBrandingSync skips until ACCOUNT-P1-011 spec ships', () => {
  const actions = planBrandingSync({ schemaVersion: 1, enabled: true }, null);
  assert.equal(actions[0].kind, 'skip');
  assert.match(String(actions[0].reason), /P1-011/);
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
