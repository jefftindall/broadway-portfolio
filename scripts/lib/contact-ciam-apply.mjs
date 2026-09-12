/**
 * Graph apply handlers for CIAM IdPs and branding (ACCOUNT-P1-010 / P1-011).
 */
import {
  buildBrandingLocalizationPatch,
  bannerLogoContentType,
  normalizeBrandingSpec,
} from './contact-ciam-branding.mjs';
import {
  buildIdentityProviderRequestBody,
  findRemoteIdp,
  resolveGraphIdpKey,
} from './contact-ciam-idp.mjs';
import {
  createIdentityProvider,
  getOrganizationId,
  patchBrandingLocalization,
  patchIdentityProvider,
  uploadBannerLogo,
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
 *   brandingManifest: Record<string, unknown>;
 * }} context
 */
export async function applyBrandingAction(context) {
  const spec = /** @type {Record<string, unknown>} */ (context.brandingManifest.spec ?? {});
  const normalized = normalizeBrandingSpec(spec);
  const orgId = await getOrganizationId(context.tenantId);
  if (!orgId) {
    fail('Organization id not found for branding apply');
  }

  const patch = buildBrandingLocalizationPatch(spec);
  if (Object.keys(patch).length > 0) {
    await patchBrandingLocalization(context.tenantId, orgId, normalized.locale, patch);
  }

  if (normalized.bannerLogoUrl) {
    if (!/^https:\/\//i.test(normalized.bannerLogoUrl)) {
      fail('branding.spec.bannerLogoUrl must be an https URL');
    }
    const response = await fetch(normalized.bannerLogoUrl);
    if (!response.ok) {
      fail(`Failed to fetch banner logo (HTTP ${response.status})`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    await uploadBannerLogo(
      context.tenantId,
      orgId,
      normalized.locale,
      bytes,
      bannerLogoContentType(normalized.bannerLogoUrl),
    );
  }
}
