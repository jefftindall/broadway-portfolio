/**
 * Build Microsoft Graph identity provider bodies and fingerprints (ACCOUNT-P1-010).
 */
import { stableJson } from './contact-ciam-manifest.mjs';

/**
 * @param {Record<string, unknown>} doc
 * @returns {string}
 */
export function resolveGraphIdpKey(doc) {
  return String(doc.graphIdentityProviderId ?? doc.key ?? '').trim();
}

/**
 * @param {Record<string, unknown>} doc
 * @param {{ values: Record<string, string> }} credentials
 * @returns {Record<string, unknown>}
 */
export function buildGoogleIdentityProviderBody(doc, credentials) {
  return {
    '@odata.type': '#microsoft.graph.socialIdentityProvider',
    displayName: String(doc.displayName ?? 'Google'),
    identityProviderType: 'Google',
    clientId: credentials.values.clientId,
    clientSecret: credentials.values.clientSecret,
  };
}

/**
 * @param {string} privateKey
 * @returns {string}
 */
export function normalizeApplePrivateKey(privateKey) {
  const trimmed = String(privateKey ?? '').trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('BEGIN PRIVATE KEY')) return trimmed;
  return `-----BEGIN PRIVATE KEY-----\n${trimmed}\n-----END PRIVATE KEY-----`;
}

/**
 * @param {Record<string, unknown>} doc
 * @param {{ values: Record<string, string> }} credentials
 * @returns {Record<string, unknown>}
 */
export function buildAppleIdentityProviderBody(doc, credentials) {
  return {
    '@odata.type': '#microsoft.graph.appleManagedIdentityProvider',
    displayName: String(doc.displayName ?? 'Apple'),
    developerId: credentials.values.teamId,
    serviceId: credentials.values.serviceId,
    keyId: credentials.values.keyId,
    certificateData: normalizeApplePrivateKey(credentials.values.privateKey),
  };
}

/**
 * @param {Record<string, unknown>} doc
 * @param {{ values: Record<string, string> }} credentials
 * @returns {Record<string, unknown>}
 */
export function buildOidcIdentityProviderBody(doc, credentials) {
  const spec = /** @type {Record<string, unknown>} */ (doc.spec ?? {});
  const issuer = String(spec.issuer ?? 'https://login.microsoftonline.com/consumers/v2.0').trim();
  return {
    '@odata.type': '#microsoft.graph.oidcIdentityProvider',
    displayName: String(doc.displayName ?? 'OIDC'),
    clientId: credentials.values.clientId,
    clientSecret: credentials.values.clientSecret,
    issuer,
  };
}

/**
 * @param {Record<string, unknown>} doc
 * @param {{ values: Record<string, string> }} credentials
 * @returns {Record<string, unknown>}
 */
export function buildIdentityProviderRequestBody(doc, credentials) {
  const type = String(/** @type {Record<string, unknown>} */ (doc.spec ?? {}).type ?? '').trim();
  if (type === 'google') return buildGoogleIdentityProviderBody(doc, credentials);
  if (type === 'apple') return buildAppleIdentityProviderBody(doc, credentials);
  if (type === 'oidc') return buildOidcIdentityProviderBody(doc, credentials);
  throw new Error(`Unsupported idp type for apply: ${type || '(missing)'}`);
}

/**
 * Compare non-secret IdP fields for drift detection.
 *
 * @param {Record<string, unknown>} doc
 * @param {Record<string, unknown> | null | undefined} remote
 * @returns {string}
 */
export function idpPublicFingerprint(doc, remote) {
  const type = String(/** @type {Record<string, unknown>} */ (doc.spec ?? {}).type ?? '').trim();
  if (type === 'builtin') {
    return stableJson({ type: 'builtin', id: resolveGraphIdpKey(doc) });
  }
  if (type === 'google') {
    return stableJson({ type, clientId: remote?.clientId ?? null });
  }
  if (type === 'apple') {
    return stableJson({
      type,
      serviceId: remote?.serviceId ?? null,
      keyId: remote?.keyId ?? null,
      developerId: remote?.developerId ?? null,
    });
  }
  if (type === 'oidc') {
    const spec = /** @type {Record<string, unknown>} */ (doc.spec ?? {});
    return stableJson({
      type,
      clientId: remote?.clientId ?? null,
      issuer: remote?.issuer ?? spec.issuer ?? null,
    });
  }
  return stableJson({ type });
}

/**
 * @param {Record<string, unknown>} doc
 * @param {{ values: Record<string, string> }} credentials
 * @returns {string}
 */
export function idpDesiredPublicFingerprint(doc, credentials) {
  const type = String(/** @type {Record<string, unknown>} */ (doc.spec ?? {}).type ?? '').trim();
  if (type === 'builtin') {
    return stableJson({ type: 'builtin', id: resolveGraphIdpKey(doc) });
  }
  if (type === 'google') {
    return stableJson({ type, clientId: credentials.values.clientId ?? null });
  }
  if (type === 'apple') {
    return stableJson({
      type,
      serviceId: credentials.values.serviceId ?? null,
      keyId: credentials.values.keyId ?? null,
      developerId: credentials.values.teamId ?? null,
    });
  }
  if (type === 'oidc') {
    const spec = /** @type {Record<string, unknown>} */ (doc.spec ?? {});
    return stableJson({ type, clientId: credentials.values.clientId ?? null, issuer: spec.issuer ?? null });
  }
  return stableJson({ type });
}

/**
 * @param {Map<string, { id?: string; displayName?: string }>} remoteByKey
 * @param {string} graphKey
 * @returns {{ id?: string; displayName?: string } | undefined}
 */
export function findRemoteIdp(remoteByKey, graphKey) {
  const trimmed = graphKey.trim();
  if (!trimmed) return undefined;
  return (
    remoteByKey.get(trimmed) ??
    remoteByKey.get(trimmed.toLowerCase()) ??
    remoteByKey.get(trimmed.toUpperCase())
  );
}
