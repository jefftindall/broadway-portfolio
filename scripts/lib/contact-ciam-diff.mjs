/**
 * Plan CIAM Graph sync actions from desired manifest vs remote snapshot.
 */
import {
  brandingDesiredFingerprint,
  brandingLocalizationFingerprint,
} from './contact-ciam-branding.mjs';
import {
  findRemoteIdp,
  idpDesiredPublicFingerprint,
  idpPublicFingerprint,
  resolveGraphIdpKey,
} from './contact-ciam-idp.mjs';

/**
 * @typedef {'noop' | 'create' | 'update' | 'skip'} PlanActionKind
 */

/**
 * @typedef {{
 *   kind: PlanActionKind;
 *   resource: 'userFlow' | 'identityProvider' | 'branding';
 *   name: string;
 *   reason?: string;
 *   details?: Record<string, unknown>;
 * }} PlanAction
 */

/**
 * True when flow planning may need a remote Graph snapshot (ACCOUNT-P1-008+).
 *
 * @param {Record<string, unknown> | null | undefined} flowManifest
 * @returns {boolean}
 */
export function flowManifestNeedsRemoteLookup(flowManifest) {
  if (!flowManifest || flowManifest.enabled === false) {
    return false;
  }
  const spec = flowManifest.spec;
  return Boolean(spec && typeof spec === 'object');
}

/**
 * @param {Record<string, unknown> | null | undefined} flowManifest
 * @param {{ id?: string; displayName?: string; applicationClientId?: string } | null} remoteFlow
 * @param {string} applicationClientId
 * @returns {PlanAction[]}
 */
export function planUserFlowSync(flowManifest, remoteFlow, applicationClientId) {
  if (!flowManifest) {
    return [{ kind: 'skip', resource: 'userFlow', name: '(none)', reason: 'no flow manifest for environment' }];
  }

  const enabled = flowManifest.enabled !== false;
  const displayName = String(flowManifest.displayName ?? '').trim();
  if (!enabled) {
    return [{ kind: 'skip', resource: 'userFlow', name: displayName || '(unnamed)', reason: 'enabled=false in manifest' }];
  }
  if (!displayName) {
    throw new Error('flow manifest requires displayName when enabled=true');
  }
  if (!applicationClientId) {
    return [{ kind: 'skip', resource: 'userFlow', name: displayName, reason: 'CONTACT_OIDC_CLIENT_ID not ready' }];
  }
  if (!flowManifest.spec || typeof flowManifest.spec !== 'object') {
    return [
      {
        kind: 'skip',
        resource: 'userFlow',
        name: displayName,
        reason: 'flow.spec missing — implement ACCOUNT-P1-008 before create/update',
        details: { applicationClientId },
      },
    ];
  }

  if (!remoteFlow?.id) {
    return [
      {
        kind: 'create',
        resource: 'userFlow',
        name: displayName,
        details: { applicationClientId },
      },
    ];
  }

  const remoteName = String(remoteFlow.displayName ?? '').trim();
  if (remoteName !== displayName) {
    return [
      {
        kind: 'update',
        resource: 'userFlow',
        name: displayName,
        reason: `displayName drift (${remoteName || remoteFlow.id})`,
        details: { flowId: remoteFlow.id, applicationClientId },
      },
    ];
  }

  return [
    {
      kind: 'noop',
      resource: 'userFlow',
      name: displayName,
      details: { flowId: remoteFlow.id, applicationClientId },
    },
  ];
}

/**
 * @param {Record<string, unknown>[]} idpManifests
 * @param {Map<string, Record<string, unknown>>} remoteByKey
 * @param {Map<string, import('./contact-ciam-secrets.mjs').IdpCredentialBundle>} [idpCredentials]
 * @param {Map<string, Record<string, unknown>>} [remoteDetailsByKey]
 * @returns {PlanAction[]}
 */
export function planIdentityProviderSync(idpManifests, remoteByKey, idpCredentials = new Map(), remoteDetailsByKey = new Map()) {
  /** @type {PlanAction[]} */
  const actions = [];
  for (const doc of idpManifests) {
    const key = String(doc.key ?? doc.id ?? '').trim();
    const displayName = String(doc.displayName ?? key).trim() || key;
    const graphKey = resolveGraphIdpKey(doc);
    if (!key) {
      throw new Error('idp manifest requires key or id');
    }
    if (doc.enabled === false) {
      actions.push({
        kind: 'skip',
        resource: 'identityProvider',
        name: displayName,
        reason: 'enabled=false in manifest',
      });
      continue;
    }
    const spec = doc.spec;
    if (!spec || typeof spec !== 'object') {
      actions.push({
        kind: 'skip',
        resource: 'identityProvider',
        name: displayName,
        reason: 'idp.spec missing',
      });
      continue;
    }

    const type = String(/** @type {Record<string, unknown>} */ (spec).type ?? '').trim();
    const remoteListed = findRemoteIdp(remoteByKey, graphKey);
    const remoteDetail =
      remoteDetailsByKey.get(graphKey) ??
      remoteDetailsByKey.get(graphKey.toLowerCase()) ??
      remoteListed ??
      null;

    if (type === 'builtin') {
      actions.push(
        remoteListed?.id
          ? {
              kind: 'noop',
              resource: 'identityProvider',
              name: displayName,
              details: { key, idpId: remoteListed.id },
            }
          : {
              kind: 'skip',
              resource: 'identityProvider',
              name: displayName,
              reason: 'built-in Microsoft Account IdP missing — enable once in Entra portal if needed',
              details: { key },
            },
      );
      continue;
    }

    const credentials = idpCredentials.get(key);
    if (!credentials?.ready) {
      const missing = credentials?.missing?.join(', ') || 'CONTACT-IDP-* secrets';
      actions.push({
        kind: 'skip',
        resource: 'identityProvider',
        name: displayName,
        reason: `KV secrets not ready (${missing})`,
        details: { key },
      });
      continue;
    }

    if (!remoteListed?.id) {
      actions.push({
        kind: 'create',
        resource: 'identityProvider',
        name: displayName,
        details: { key, graphKey },
      });
      continue;
    }

    const resyncCredentials = /** @type {Record<string, unknown>} */ (spec).resyncCredentials === true;
    const desiredFingerprint = idpDesiredPublicFingerprint(doc, credentials);
    const remoteFingerprint = idpPublicFingerprint(doc, remoteDetail);
    if (desiredFingerprint === remoteFingerprint && !resyncCredentials) {
      actions.push({
        kind: 'noop',
        resource: 'identityProvider',
        name: displayName,
        details: { key, idpId: remoteListed.id },
      });
      continue;
    }

    actions.push({
      kind: 'update',
      resource: 'identityProvider',
      name: displayName,
      reason: resyncCredentials ? 'resyncCredentials=true' : 'public IdP fields drift',
      details: { key, idpId: remoteListed.id, graphKey },
    });
  }
  return actions;
}

/**
 * @param {Record<string, unknown> | null} brandingManifest
 * @param {Record<string, unknown> | null | undefined} remoteBranding
 * @returns {PlanAction[]}
 */
export function planBrandingSync(brandingManifest, remoteBranding) {
  if (!brandingManifest) {
    return [{ kind: 'skip', resource: 'branding', name: 'theme', reason: 'no branding manifest' }];
  }
  if (brandingManifest.enabled === false) {
    return [{ kind: 'skip', resource: 'branding', name: 'theme', reason: 'enabled=false' }];
  }
  const spec = brandingManifest.spec;
  if (!spec || typeof spec !== 'object') {
    return [{ kind: 'skip', resource: 'branding', name: 'theme', reason: 'branding.spec missing' }];
  }

  const desiredFingerprint = brandingDesiredFingerprint(/** @type {Record<string, unknown>} */ (spec));
  const localization = remoteBranding?.localization;
  const remoteFingerprint = brandingLocalizationFingerprint(
    localization && typeof localization === 'object'
      ? /** @type {Record<string, unknown>} */ (localization)
      : null,
  );

  const logoUrl = String(/** @type {Record<string, unknown>} */ (spec).bannerLogoUrl ?? '').trim();
  const resyncLogo = /** @type {Record<string, unknown>} */ (spec).resyncLogo === true;
  const hasRemoteLogo = Boolean(
    localization &&
      typeof localization === 'object' &&
      /** @type {Record<string, unknown>} */ (localization).bannerLogoRelativeUrl,
  );

  if (!remoteBranding?.orgId) {
    return [
      {
        kind: 'create',
        resource: 'branding',
        name: 'theme',
        details: { uploadLogo: Boolean(logoUrl) },
      },
    ];
  }

  if (desiredFingerprint !== remoteFingerprint || (logoUrl && (resyncLogo || !hasRemoteLogo))) {
    return [
      {
        kind: 'update',
        resource: 'branding',
        name: 'theme',
        reason:
          desiredFingerprint !== remoteFingerprint
            ? 'branding localization drift'
            : logoUrl
              ? 'banner logo upload pending'
              : undefined,
        details: { orgId: remoteBranding.orgId, uploadLogo: Boolean(logoUrl) },
      },
    ];
  }

  return [{ kind: 'noop', resource: 'branding', name: 'theme', details: { orgId: remoteBranding.orgId } }];
}

/**
 * @param {PlanAction[]} actions
 * @returns {PlanAction[]}
 */
export function summarizePlan(actions) {
  return actions.filter((action) => action.kind !== 'noop');
}

/**
 * @param {PlanAction[]} actions
 * @returns {boolean}
 */
export function planHasPendingChanges(actions) {
  return actions.some((action) => action.kind === 'create' || action.kind === 'update');
}

/**
 * @param {PlanAction} action
 * @returns {string}
 */
export function formatPlanAction(action) {
  const parts = [`${action.kind.toUpperCase()}`, action.resource, action.name];
  if (action.reason) parts.push(`— ${action.reason}`);
  if (action.details?.flowId) parts.push(`(flowId=${action.details.flowId})`);
  if (action.details?.idpId) parts.push(`(idpId=${action.details.idpId})`);
  if (action.details?.applicationClientId) parts.push(`(appId=${action.details.applicationClientId})`);
  return parts.join(' ');
}
