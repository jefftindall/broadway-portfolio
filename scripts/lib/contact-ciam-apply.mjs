/**
 * Graph apply handlers for CIAM IdPs and branding (ACCOUNT-P1-010 / P1-011).
 */
import {
  buildBrandingThemeLocalizationPatch,
  fetchBannerLogoFromUrl,
  normalizeBrandingSpec,
  resolveBannerLogoAsset,
} from './contact-ciam-branding.mjs';
import { buildUserFlowRequestBody } from './contact-ciam-flow.mjs';
import {
  buildIdentityProviderRequestBody,
  findRemoteIdp,
  resolveGraphIdpKey,
} from './contact-ciam-idp.mjs';
import {
  createAuthenticationEventsFlow,
  createBrandingLocalization,
  createBrandingTheme,
  createBrandingThemeLocalization,
  createIdentityProvider,
  getOrganizationId,
  isBrandingThemeUnavailable,
  patchAuthenticationEventsFlow,
  patchBrandingLocalization,
  patchBrandingTheme,
  patchBrandingThemeLocalization,
  patchIdentityProvider,
  uploadBannerLogo,
  uploadBrandingThemeBannerLogo,
} from './contact-ciam-graph.mjs';

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  throw new Error(message);
}

/**
 * @param {{
 *   tenantId: string;
 *   action: import('./contact-ciam-diff.mjs').PlanAction;
 *   idpManifests: Record<string, unknown>[];
 *   idpCredentials: Map<string, import('./contact-ciam-secrets.mjs').IdpCredentialBundle>;
 *   remoteByKey: Map<string, Record<string, unknown>>;
 * }} context
 */
export async function applyIdentityProviderAction(context) {
  const key = String(context.action.details?.key ?? '').trim();
  const doc = context.idpManifests.find((item) => String(item.key ?? '').trim() === key);
  if (!doc) {
    fail(`Missing idp manifest for key ${key || '(unknown)'}`);
  }

  const spec = /** @type {Record<string, unknown>} */ (doc.spec ?? {});
  const type = String(spec.type ?? '').trim();
  const graphKey = resolveGraphIdpKey(doc);

  if (type === 'builtin') {
    const remote = findRemoteIdp(context.remoteByKey, graphKey);
    if (!remote?.id) {
      fail(
        `${context.action.name}: built-in Microsoft Account IdP not found — enable once in Entra (External Identities → Identity providers → Microsoft Account)`,
      );
    }
    return;
  }

  const credentials = context.idpCredentials.get(key);
  if (!credentials?.ready) {
    const missing = credentials?.missing?.join(', ') || 'credentials';
    fail(`${context.action.name}: KV secrets not ready (${missing})`);
  }

  const body = buildIdentityProviderRequestBody(doc, credentials);
  const remote = findRemoteIdp(context.remoteByKey, graphKey);
  const idpId = String(remote?.id ?? graphKey);

  if (context.action.kind === 'create') {
    await createIdentityProvider(context.tenantId, body);
    return;
  }

  if (context.action.kind === 'update') {
    await patchIdentityProvider(context.tenantId, idpId, body);
    return;
  }

  fail(`Unsupported identity provider action kind: ${context.action.kind}`);
}

/**
 * @param {{
 *   tenantId: string;
 *   action: import('./contact-ciam-diff.mjs').PlanAction;
 *   flowManifest: Record<string, unknown>;
 *   applicationClientId: string;
 * }} context
 */
export async function applyUserFlowAction(context) {
  const displayName = String(context.flowManifest.displayName ?? '').trim();
  const applicationClientId = context.applicationClientId.trim();
  if (!displayName || !applicationClientId) {
    fail('User flow apply requires displayName and CONTACT_OIDC_CLIENT_ID');
  }
  const spec = context.flowManifest.spec;
  if (!spec || typeof spec !== 'object') {
    fail(`${displayName}: flow.spec missing`);
  }

  const body = buildUserFlowRequestBody(displayName, applicationClientId, spec);
  if (context.action.kind === 'create') {
    await createAuthenticationEventsFlow(context.tenantId, body);
    return;
  }

  const flowId = String(context.action.details?.flowId ?? '').trim();
  if (!flowId) {
    fail(`${displayName}: update missing flowId`);
  }
  await patchAuthenticationEventsFlow(context.tenantId, flowId, body);
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isMissingThemeLocalization(err) {
  const message = err instanceof Error ? err.message : String(err);
  return /localizations\/0|ResourceNotFound|Not Found|404/i.test(message);
}

/**
 * @param {{
 *   tenantId: string;
 *   repoRoot: string;
 *   action: import('./contact-ciam-diff.mjs').PlanAction;
 *   brandingManifest: Record<string, unknown>;
 * }} context
 */
export async function applyBrandingAction(context) {
  try {
    await applyBrandingThemeAction(context);
  } catch (err) {
    if (!isBrandingThemeUnavailable(err)) {
      throw err;
    }
    await applyCompanyBrandingAction(context);
  }
}

/**
 * @param {{
 *   tenantId: string;
 *   repoRoot: string;
 *   action: import('./contact-ciam-diff.mjs').PlanAction;
 *   brandingManifest: Record<string, unknown>;
 * }} context
 */
async function applyBrandingThemeAction(context) {
  const spec = /** @type {Record<string, unknown>} */ (context.brandingManifest.spec ?? {});
  const normalized = normalizeBrandingSpec(spec);
  const orgId = await getOrganizationId(context.tenantId);
  if (!orgId) {
    fail('Organization id not found for branding apply');
  }

  let themeId = String(context.action.details?.themeId ?? '').trim();
  if (!themeId) {
    const created = /** @type {{ id?: string }} */ (
      await createBrandingTheme(context.tenantId, orgId, {
        name: normalized.themeName,
        isDefaultTheme: normalized.isDefaultTheme,
      })
    );
    themeId = String(created.id ?? '').trim();
    if (!themeId) {
      fail('Branding theme create did not return id');
    }
  } else {
    await patchBrandingTheme(context.tenantId, orgId, themeId, {
      name: normalized.themeName,
      isDefaultTheme: normalized.isDefaultTheme,
    });
  }

  const patch = buildBrandingThemeLocalizationPatch(spec);
  if (Object.keys(patch).length > 0) {
    try {
      await patchBrandingThemeLocalization(
        context.tenantId,
        orgId,
        themeId,
        normalized.locale,
        patch,
      );
    } catch (err) {
      if (!isMissingThemeLocalization(err)) {
        throw err;
      }
      await createBrandingThemeLocalization(
        context.tenantId,
        orgId,
        themeId,
        normalized.locale,
        patch,
      );
    }
  }

  let logoAsset = resolveBannerLogoAsset(context.repoRoot, spec);
  if (!logoAsset && normalized.bannerLogoUrl) {
    logoAsset = await fetchBannerLogoFromUrl(normalized.bannerLogoUrl);
  }
  if (logoAsset) {
    await uploadBrandingThemeBannerLogo(
      context.tenantId,
      orgId,
      themeId,
      normalized.locale,
      logoAsset.bytes,
      logoAsset.contentType,
    );
  }
}

/**
 * @param {{
 *   tenantId: string;
 *   repoRoot: string;
 *   action: import('./contact-ciam-diff.mjs').PlanAction;
 *   brandingManifest: Record<string, unknown>;
 * }} context
 */
async function applyCompanyBrandingAction(context) {
  const spec = /** @type {Record<string, unknown>} */ (context.brandingManifest.spec ?? {});
  const normalized = normalizeBrandingSpec(spec);
  const orgId = await getOrganizationId(context.tenantId);
  if (!orgId) {
    fail('Organization id not found for branding apply');
  }

  const patch = buildBrandingThemeLocalizationPatch(spec);
  if (context.action.kind === 'create' || Object.keys(patch).length > 0) {
    try {
      await patchBrandingLocalization(context.tenantId, orgId, normalized.locale, patch);
    } catch (err) {
      if (!isMissingThemeLocalization(err)) {
        throw err;
      }
      await createBrandingLocalization(context.tenantId, orgId, normalized.locale, patch);
    }
  }

  let logoAsset = resolveBannerLogoAsset(context.repoRoot, spec);
  if (!logoAsset && normalized.bannerLogoUrl) {
    logoAsset = await fetchBannerLogoFromUrl(normalized.bannerLogoUrl);
  }
  if (logoAsset) {
    await uploadBannerLogo(
      context.tenantId,
      orgId,
      normalized.locale,
      logoAsset.bytes,
      logoAsset.contentType,
    );
  }
}
