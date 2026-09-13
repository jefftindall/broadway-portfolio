#!/usr/bin/env node
/**
 * Apply Entra External ID (CIAM) user-flow / IdP / branding desired state via Microsoft Graph.
 *
 * ACCOUNT-P1-007 foundation; IdP + branding apply in P1-010 / P1-011; user flows in P1-008.
 *
 * Usage:
 *   node scripts/apply-contact-ciam-config.mjs [--dry-run] [--env staging|prod]
 *
 * Env:
 *   CONTACT_CIAM_ENV              staging | prod (default staging)
 *   CONTACT_CIAM_TENANT_ID        CIAM tenant GUID
 *   CONTACT_OIDC_CLIENT_ID        env OIDC app client id (for flow association)
 *   CONTACT_CIAM_TF_CLIENT_ID     CIAM Terraform GHA app (Actions federated login)
 *   AZURE_SHARED_KEY_VAULT_NAME   shared KV for CONTACT-IDP-* secrets (default kv-elyse-shared)
 *   CONTACT_CIAM_SKIP_APPLY       when true, exit 0 without Graph calls
 *   CONTACT_CIAM_REPO_ROOT        repo root (default cwd)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBrandingAction, applyIdentityProviderAction, applyUserFlowAction } from './lib/contact-ciam-apply.mjs';
import {
  flowManifestNeedsRemoteLookup,
  formatPlanAction,
  planBrandingSync,
  planHasPendingChanges,
  planIdentityProviderSync,
  planUserFlowSync,
  summarizePlan,
} from './lib/contact-ciam-diff.mjs';
import { resolveGraphIdpKey } from './lib/contact-ciam-idp.mjs';
import {
  EMPTY_CONTACT_CIAM_REMOTE,
  ensureAuthenticationExtensionsServicePrincipal,
  ensureCiamGraphSession,
  fetchRemoteContactCiamState,
  isGraphAccessError,
} from './lib/contact-ciam-graph.mjs';
import {
  loadContactCiamManifest,
  resolveContactCiamManifest,
  SUPPORTED_ENVIRONMENTS,
} from './lib/contact-ciam-manifest.mjs';
import { loadIdpCredentials } from './lib/contact-ciam-secrets.mjs';

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/**
 * @returns {{ dryRun: boolean; environment: string }}
 */
function parseCliArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let environment = process.env.CONTACT_CIAM_ENV?.trim() || 'staging';
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--env' && args[i + 1]) {
      environment = args[i + 1].trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--env=')) {
      environment = arg.slice('--env='.length).trim();
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }
  if (!SUPPORTED_ENVIRONMENTS.includes(environment)) {
    fail(`--env must be one of: ${SUPPORTED_ENVIRONMENTS.join(', ')}`);
  }
  return { dryRun, environment };
}

/**
 * @typedef {import('./lib/contact-ciam-graph.mjs').ContactCiamReadFailures} ContactCiamReadFailures
 */

/**
 * @param {import('./lib/contact-ciam-diff.mjs').PlanAction[]} actions
 * @param {ContactCiamReadFailures} readFailures
 * @returns {{ applyActions: import('./lib/contact-ciam-diff.mjs').PlanAction[]; deferredActions: import('./lib/contact-ciam-diff.mjs').PlanAction[] }}
 */
export function partitionActionsByReadFailures(actions, readFailures) {
  /** @type {import('./lib/contact-ciam-diff.mjs').PlanAction[]} */
  const applyActions = [];
  /** @type {import('./lib/contact-ciam-diff.mjs').PlanAction[]} */
  const deferredActions = [];

  for (const action of actions) {
    if (action.kind !== 'create' && action.kind !== 'update') {
      applyActions.push(action);
      continue;
    }
    if (action.resource === 'identityProvider' && readFailures.identityProviders) {
      deferredActions.push(action);
      continue;
    }
    if (action.resource === 'userFlow' && readFailures.userFlow) {
      deferredActions.push(action);
      continue;
    }
    applyActions.push(action);
  }

  return { applyActions, deferredActions };
}

/**
 * @param {import('./lib/contact-ciam-diff.mjs').PlanAction[]} actions
 * @param {boolean} dryRun
 * @param {{
 *   tenantId: string;
 *   idpManifests: Record<string, unknown>[];
 *   idpCredentials: Map<string, import('./lib/contact-ciam-secrets.mjs').IdpCredentialBundle>;
 *   remoteByKey: Map<string, Record<string, unknown>>;
 *   brandingManifest: Record<string, unknown> | null;
 *   flowManifest: Record<string, unknown> | null;
 *   applicationClientId: string;
 *   repoRoot: string;
 * }} context
 */
async function applyPlan(actions, dryRun, context) {
  const resourceOrder = /** @type {const} */ (['branding', 'identityProvider', 'userFlow']);
  const sorted = [...actions].sort((left, right) => {
    const leftIndex = resourceOrder.indexOf(left.resource);
    const rightIndex = resourceOrder.indexOf(right.resource);
    return (leftIndex === -1 ? resourceOrder.length : leftIndex) - (rightIndex === -1 ? resourceOrder.length : rightIndex);
  });

  /** @type {import('./lib/contact-ciam-diff.mjs').PlanAction[]} */
  const applied = [];
  /** @type {import('./lib/contact-ciam-diff.mjs').PlanAction[]} */
  const deferred = [];

  for (const action of sorted) {
    if (action.kind !== 'create' && action.kind !== 'update') continue;
    if (dryRun) continue;

    try {
      if (action.resource === 'userFlow') {
        if (!context.flowManifest) {
          fail('User flow apply requested without flow manifest');
        }
        await applyUserFlowAction({
          tenantId: context.tenantId,
          action,
          flowManifest: context.flowManifest,
          applicationClientId: context.applicationClientId,
        });
        applied.push(action);
        continue;
      }

      if (action.resource === 'identityProvider') {
        await applyIdentityProviderAction({
          tenantId: context.tenantId,
          action,
          idpManifests: context.idpManifests,
          idpCredentials: context.idpCredentials,
          remoteByKey: context.remoteByKey,
        });
        applied.push(action);
        continue;
      }

      if (action.resource === 'branding') {
        if (!context.brandingManifest) {
          fail('Branding apply requested without branding manifest');
        }
        await applyBrandingAction({
          tenantId: context.tenantId,
          repoRoot: context.repoRoot,
          action,
          brandingManifest: context.brandingManifest,
        });
        applied.push(action);
        continue;
      }

      fail(`${formatPlanAction(action)} is not implemented.`);
    } catch (err) {
      if (isGraphAccessError(err)) {
        deferred.push(action);
        process.stdout.write(
          `${formatPlanAction(action)} deferred (${err instanceof Error ? err.message : String(err)})\n`,
        );
        continue;
      }
      throw err;
    }
  }

  if (deferred.length > 0 && applied.length === 0) {
    fail('CIAM Graph apply could not write any pending changes (missing CONTACT-CIAM-TF Graph application permissions).');
  }

  if (deferred.length > 0) {
    process.stdout.write(`${deferred.length} CIAM apply action(s) deferred due to Graph access errors.\n`);
  }
}

/**
 * @param {{
 *   dryRun: boolean;
 *   environment: string;
 *   tenantId: string;
 *   applicationClientId: string;
 *   tfClientId?: string;
 *   repoRoot: string;
 *   sharedKeyVaultName?: string;
 * }} options
 */
export async function applyContactCiamConfig(options) {
  const manifest = resolveContactCiamManifest(loadContactCiamManifest(options.repoRoot, options.environment), {
    ...process.env,
    CONTACT_CIAM_ENV: options.environment,
    CONTACT_OIDC_CLIENT_ID: options.applicationClientId,
  });

  const idpCredentials = loadIdpCredentials(manifest.idps, {
    vaultName: options.sharedKeyVaultName,
  });
  const idpGraphKeys = manifest.idps
    .filter((doc) => doc.enabled !== false)
    .map((doc) => resolveGraphIdpKey(doc))
    .filter(Boolean);

  await ensureCiamGraphSession({
    tenantId: options.tenantId,
    tfClientId: options.tfClientId,
  });

  const brandingThemeName = String(
    /** @type {Record<string, unknown>} */ (manifest.branding?.spec ?? {}).themeName ?? 'Elyse Contact Accounts',
  ).trim();

  let remote = EMPTY_CONTACT_CIAM_REMOTE;
  try {
    remote = await fetchRemoteContactCiamState(
      options.tenantId,
      options.applicationClientId,
      idpGraphKeys,
      {
        skipUserFlow: !flowManifestNeedsRemoteLookup(manifest.flow),
        brandingThemeName,
      },
    );
  } catch (err) {
    if (!isGraphAccessError(err)) {
      throw err;
    }
    process.stdout.write(
      `CIAM Graph read failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  if (remote.readFailures.identityProviders) {
    process.stdout.write(
      'CIAM identity provider snapshot unavailable — IdP apply actions will be deferred if planned.\n',
    );
  }
  if (remote.readFailures.userFlow) {
    process.stdout.write('CIAM user flow snapshot unavailable — flow apply actions will be deferred if planned.\n');
  }

  const actions = [
    ...planUserFlowSync(manifest.flow, remote.flow, options.applicationClientId),
    ...planIdentityProviderSync(manifest.idps, remote.idps, idpCredentials, remote.idpDetails),
    ...planBrandingSync(manifest.branding, remote.branding),
  ];

  const interesting = summarizePlan(actions);
  for (const action of actions) {
    process.stdout.write(`${formatPlanAction(action)}\n`);
  }

  if (interesting.length === 0 || !planHasPendingChanges(actions)) {
    process.stdout.write('CIAM config in sync (no pending changes).\n');
    return { changed: false, actions };
  }

  const { applyActions, deferredActions } = partitionActionsByReadFailures(actions, remote.readFailures);
  for (const action of deferredActions) {
    process.stdout.write(`${formatPlanAction(action)} (deferred — remote snapshot unavailable)\n`);
  }

  const pendingApply = applyActions.filter((action) => action.kind === 'create' || action.kind === 'update');
  if (pendingApply.length === 0) {
    process.stdout.write('CIAM Graph apply deferred until remote snapshots are readable (CONTACT-CIAM-TF Graph permissions).\n');
    return { changed: false, actions, deferred: deferredActions.length > 0 };
  }

  if (options.dryRun) {
    process.stdout.write('Dry run: pending Graph writes listed above; no changes applied.\n');
    return { changed: planHasPendingChanges(actions), actions };
  }

  if (pendingApply.some((action) => action.resource === 'identityProvider')) {
    await ensureAuthenticationExtensionsServicePrincipal(options.tenantId);
  }

  await applyPlan(pendingApply, options.dryRun, {
    tenantId: options.tenantId,
    repoRoot: options.repoRoot,
    idpManifests: manifest.idps,
    idpCredentials,
    remoteByKey: remote.idps,
    brandingManifest: manifest.branding,
    flowManifest: manifest.flow,
    applicationClientId: options.applicationClientId,
  });
  process.stdout.write('CIAM config apply complete.\n');
  return { changed: true, actions };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  if (/^(1|true|yes)$/i.test(String(process.env.CONTACT_CIAM_SKIP_APPLY ?? ''))) {
    process.stdout.write('Skipped CIAM config apply (CONTACT_CIAM_SKIP_APPLY=true).\n');
    process.exit(0);
  }

  const { dryRun, environment } = parseCliArgs();
  const tenantId = String(process.env.CONTACT_CIAM_TENANT_ID ?? '').trim();
  const applicationClientId = String(process.env.CONTACT_OIDC_CLIENT_ID ?? '').trim();
  const repoRoot = path.resolve(process.env.CONTACT_CIAM_REPO_ROOT || process.cwd());

  if (!tenantId || tenantId === 'REPLACE_ME') {
    process.stdout.write('Skipped CIAM config apply (CONTACT_CIAM_TENANT_ID not ready).\n');
    process.exit(0);
  }

  applyContactCiamConfig({
    dryRun,
    environment,
    tenantId,
    applicationClientId,
    tfClientId: process.env.CONTACT_CIAM_TF_CLIENT_ID,
    repoRoot,
    sharedKeyVaultName: process.env.AZURE_SHARED_KEY_VAULT_NAME,
  }).catch((err) => {
    fail(err instanceof Error ? err.message : String(err));
  });
}
