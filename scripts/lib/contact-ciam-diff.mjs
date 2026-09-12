/**
 * Plan CIAM Graph sync actions from desired manifest vs remote snapshot.
 */

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
 * @param {Map<string, { id?: string; displayName?: string }>} remoteByKey
 * @returns {PlanAction[]}
 */
export function planIdentityProviderSync(idpManifests, remoteByKey) {
  /** @type {PlanAction[]} */
  const actions = [];
  for (const doc of idpManifests) {
    const key = String(doc.key ?? doc.id ?? '').trim();
    const displayName = String(doc.displayName ?? key).trim() || key;
    if (!key) {
      throw new Error('idp manifest requires key or id');
    }
    if (doc.enabled === false) {
      actions.push({
        kind: 'skip',
        resource: 'identityProvider',
        name: displayName,
        reason: 'enabled=false in manifest (ACCOUNT-P1-010)',
      });
      continue;
    }
    if (!doc.spec || typeof doc.spec !== 'object') {
      actions.push({
        kind: 'skip',
        resource: 'identityProvider',
        name: displayName,
        reason: 'idp.spec missing — implement ACCOUNT-P1-010 before create/update',
      });
      continue;
    }
    const remote = remoteByKey.get(key) ?? remoteByKey.get(String(doc.graphIdentityProviderId ?? ''));
    actions.push(
      remote?.id
        ? { kind: 'noop', resource: 'identityProvider', name: displayName, details: { idpId: remote.id } }
        : { kind: 'create', resource: 'identityProvider', name: displayName, details: { key } },
    );
  }
  return actions;
}

/**
 * @param {Record<string, unknown> | null} brandingManifest
 * @param {Record<string, unknown> | null} remoteBranding
 * @returns {PlanAction[]}
 */
export function planBrandingSync(brandingManifest, remoteBranding) {
  if (!brandingManifest) {
    return [{ kind: 'skip', resource: 'branding', name: 'theme', reason: 'no branding manifest' }];
  }
  if (brandingManifest.enabled === false) {
    return [{ kind: 'skip', resource: 'branding', name: 'theme', reason: 'enabled=false (ACCOUNT-P1-011)' }];
  }
  if (!brandingManifest.spec || typeof brandingManifest.spec !== 'object') {
    return [{ kind: 'skip', resource: 'branding', name: 'theme', reason: 'branding.spec missing — ACCOUNT-P1-011' }];
  }
  if (!remoteBranding) {
    return [{ kind: 'create', resource: 'branding', name: 'theme' }];
  }
  return [{ kind: 'update', resource: 'branding', name: 'theme' }];
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
