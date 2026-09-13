/**
 * Microsoft Graph client for CIAM tenant configuration (ACCOUNT-P1-007).
 * Never logs access tokens or secret values.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GRAPH_RESOURCE = 'https://graph.microsoft.com';
const GRAPH_BASE = `${GRAPH_RESOURCE}/v1.0`;
const GRAPH_BETA = `${GRAPH_RESOURCE}/beta`;

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  throw new Error(message);
}

/**
 * True when Graph rejected the call for missing CIAM GHA application permissions.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isGraphAccessError(err) {
  const message = err instanceof Error ? err.message : String(err);
  if (/branding\/themes/i.test(message) && /Request_ResourceNotFound|http-404/i.test(message)) {
    return true;
  }
  return /\(AADB2C\)|\(Authorization_RequestDenied\)|\(accessDenied\)|\(http-401\)|\(http-403\)|insufficient privileges/i.test(
    message,
  );
}

/**
 * @typedef {{
 *   identityProviders?: string;
 *   userFlow?: string;
 * }} ContactCiamReadFailures
 */

/** @type {{ flow: null; idps: Map<string, Record<string, unknown>>; branding: null; idpDetails: Map<string, Record<string, unknown>>; readFailures: ContactCiamReadFailures }} */
export const EMPTY_CONTACT_CIAM_REMOTE = {
  flow: null,
  idps: new Map(),
  branding: null,
  idpDetails: new Map(),
  readFailures: {},
};

/**
 * @param {string[]} args
 * @param {{ allowFailure?: boolean }} [options]
 * @returns {{ status: number; stdout: string; stderr: string }}
 */
function runAz(args, options = {}) {
  const result = spawnSync('az', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  if (result.status !== 0 && !options.allowFailure) {
    const err = (result.stderr || result.stdout || '').trim();
    fail(`Azure CLI failed (${args.join(' ')}): ${err || 'unknown error'}`);
  }
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  };
}

/**
 * @returns {string | null}
 */
async function fetchGitHubOidcJwt() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const token = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !token) return null;
  const audience = process.env.CONTACT_CIAM_OIDC_AUDIENCE || 'api://AzureADTokenExchange';
  const requestUrl = url.includes('?')
    ? `${url}&audience=${encodeURIComponent(audience)}`
    : `${url}?audience=${encodeURIComponent(audience)}`;
  const response = await fetch(requestUrl, {
    headers: {
      Authorization: `bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    fail(`GitHub OIDC token request failed (HTTP ${response.status})`);
  }
  const body = /** @type {{ value?: string }} */ (await response.json());
  if (!body.value) {
    fail('GitHub OIDC token response missing .value');
  }
  return body.value;
}

/**
 * Ensure az CLI has an account in the CIAM tenant for Graph calls.
 *
 * @param {{ tenantId: string; tfClientId?: string }} options
 */
export async function ensureCiamGraphSession({ tenantId, tfClientId }) {
  const trimmedTenant = tenantId.trim();
  if (!trimmedTenant) {
    fail('CONTACT_CIAM_TENANT_ID is required');
  }

  const current = runAz(['account', 'show', '-o', 'json'], { allowFailure: true });
  if (current.status === 0) {
    try {
      const account = JSON.parse(current.stdout);
      if (String(account.tenantId ?? '').toLowerCase() === trimmedTenant.toLowerCase()) {
        return;
      }
    } catch {
      // fall through
    }
  }

  // Workforce (or other home) tenant login can still mint CIAM Graph tokens via --tenant.
  const tokenProbe = runAz(
    [
      'account',
      'get-access-token',
      '--tenant',
      trimmedTenant,
      '--resource',
      GRAPH_RESOURCE,
      '-o',
      'json',
    ],
    { allowFailure: true },
  );
  if (tokenProbe.status === 0) {
    try {
      const parsed = JSON.parse(tokenProbe.stdout);
      if (String(parsed.accessToken ?? '').trim()) {
        return;
      }
    } catch {
      // fall through to federated login
    }
  }

  const clientId = (tfClientId || process.env.CONTACT_CIAM_TF_CLIENT_ID || '').trim();
  const jwt = await fetchGitHubOidcJwt();
  if (clientId && jwt) {
    const dir = mkdtempSync(join(tmpdir(), 'ciam-oidc-'));
    const jwtFile = join(dir, 'oidc.jwt');
    try {
      writeFileSync(jwtFile, jwt, { mode: 0o600 });
      runAz([
        'login',
        '--service-principal',
        '--username',
        clientId,
        '--tenant',
        trimmedTenant,
        '--federated-token',
        jwt,
        '--allow-no-subscriptions',
        '--output',
        'none',
      ]);
      return;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  fail(
    'No CIAM Graph session. Run `az login --tenant <CONTACT-CIAM-TENANT-ID> --allow-no-subscriptions` locally, or set CONTACT_CIAM_TF_CLIENT_ID with GitHub OIDC env in Actions.',
  );
}

/**
 * @param {string} tenantId
 * @returns {Promise<string>}
 */
export async function getGraphAccessToken(tenantId) {
  const result = runAz([
    'account',
    'get-access-token',
    '--tenant',
    tenantId.trim(),
    '--resource',
    GRAPH_RESOURCE,
    '-o',
    'json',
  ]);
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    fail('Failed to parse access token response from Azure CLI');
  }
  const accessToken = String(parsed.accessToken ?? '').trim();
  if (!accessToken) {
    fail('Azure CLI returned an empty Graph access token');
  }
  return accessToken;
}

/**
 * @param {{
 *   tenantId: string;
 *   method?: string;
 *   path: string;
 *   body?: unknown;
 *   accessToken?: string;
 *   baseUrl?: string;
 *   contentType?: string;
 *   rawBody?: Buffer | Uint8Array;
 *   acceptLanguage?: string;
 * }} options
 */
export async function graphRequest({
  tenantId,
  method = 'GET',
  path,
  body,
  accessToken,
  baseUrl = GRAPH_BASE,
  contentType,
  rawBody,
  acceptLanguage,
}) {
  const token = accessToken ?? (await getGraphAccessToken(tenantId));
  const url = path.startsWith('http') ? path : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  /** @type {Record<string, string>} */
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (acceptLanguage !== undefined) {
    headers['Accept-Language'] = acceptLanguage;
  }
  if (rawBody !== undefined) {
    headers['Content-Type'] = contentType || 'application/octet-stream';
  } else if (body !== undefined) {
    headers['Content-Type'] = contentType || 'application/json';
  }
  const response = await fetch(url, {
    method,
    headers,
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const kind =
      payload && typeof payload === 'object' && payload.error && typeof payload.error === 'object'
        ? String(/** @type {{ error: { code?: string }}} */ (payload).error.code ?? 'graph-error')
        : `http-${response.status}`;
    fail(`Graph ${method} ${path} failed (${kind})`);
  }
  return payload;
}

/**
 * @param {Parameters<typeof graphRequest>[0]} options
 */
export async function graphBetaRequest(options) {
  return graphRequest({ ...options, baseUrl: GRAPH_BETA });
}

/**
 * @param {string} tenantId
 * @param {string} applicationClientId
 * @returns {Promise<{ id?: string; displayName?: string } | null>}
 */
export async function findUserFlowForApplication(tenantId, applicationClientId) {
  const appId = applicationClientId.trim();
  if (!appId) return null;
  const filter = encodeURIComponent(
    `microsoft.graph.externalUsersSelfServiceSignUpEventsFlow/conditions/applications/includeApplications/any(appId:appId/appId eq '${appId}')`,
  );
  try {
    const payload = /** @type {{ value?: Array<{ id?: string; displayName?: string }> }} */ (
      await graphRequest({
        tenantId,
        path: `/identity/authenticationEventsFlows?$filter=${filter}`,
      })
    );
    const flows = payload.value ?? [];
    return flows[0] ?? null;
  } catch (err) {
    if (isGraphAccessError(err)) {
      return null;
    }
    throw err;
  }
}

/**
 * @param {string} tenantId
 * @param {string} flowId
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function getAuthenticationEventsFlow(tenantId, flowId) {
  const trimmed = flowId.trim();
  if (!trimmed) return null;
  try {
    return /** @type {Record<string, unknown>} */ (
      await graphRequest({
        tenantId,
        path: `/identity/authenticationEventsFlows/${encodeURIComponent(trimmed)}`,
      })
    );
  } catch {
    return null;
  }
}

/**
 * @param {string} tenantId
 * @param {Record<string, unknown>} body
 */
export async function createAuthenticationEventsFlow(tenantId, body) {
  return graphRequest({
    tenantId,
    method: 'POST',
    path: '/identity/authenticationEventsFlows',
    body,
  });
}

/**
 * @param {string} tenantId
 * @param {string} flowId
 * @param {Record<string, unknown>} body
 */
export async function patchAuthenticationEventsFlow(tenantId, flowId, body) {
  return graphRequest({
    tenantId,
    method: 'PATCH',
    path: `/identity/authenticationEventsFlows/${encodeURIComponent(flowId.trim())}`,
    body,
  });
}

/**
 * @param {string} tenantId
 * @returns {Promise<Map<string, { id?: string; displayName?: string }>>}
 */
export async function listIdentityProvidersByKey(tenantId) {
  let payload;
  try {
    payload = /** @type {{ value?: Array<Record<string, unknown>> }} */ (
      await graphRequest({ tenantId, path: '/identity/identityProviders' })
    );
  } catch (err) {
    if (isGraphAccessError(err)) {
      return new Map();
    }
    throw err;
  }
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map();
  for (const idp of payload.value ?? []) {
    const id = String(idp.id ?? '').trim();
    const displayName = String(idp.displayName ?? '').trim();
    if (id) {
      map.set(id, idp);
      map.set(id.toLowerCase(), idp);
    }
    if (displayName) {
      map.set(displayName, idp);
      map.set(displayName.toLowerCase(), idp);
    }
  }
  return map;
}

/**
 * @param {string} tenantId
 * @param {string} idpId
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function getIdentityProvider(tenantId, idpId) {
  const trimmed = idpId.trim();
  if (!trimmed) return null;
  try {
    return /** @type {Record<string, unknown>} */ (
      await graphRequest({
        tenantId,
        path: `/identity/identityProviders/${encodeURIComponent(trimmed)}`,
      })
    );
  } catch {
    return null;
  }
}

/**
 * @param {string} tenantId
 * @param {Record<string, unknown>} body
 */
export async function createIdentityProvider(tenantId, body) {
  return graphRequest({
    tenantId,
    method: 'POST',
    path: '/identity/identityProviders',
    body,
  });
}

/**
 * @param {string} tenantId
 * @param {string} idpId
 * @param {Record<string, unknown>} body
 */
export async function patchIdentityProvider(tenantId, idpId, body) {
  return graphRequest({
    tenantId,
    method: 'PATCH',
    path: `/identity/identityProviders/${encodeURIComponent(idpId.trim())}`,
    body,
  });
}

/**
 * @param {string} tenantId
 * @returns {Promise<string | null>}
 */
export async function getOrganizationId(tenantId) {
  const payload = /** @type {{ value?: Array<{ id?: string }> }} */ (
    await graphRequest({ tenantId, path: '/organization?$select=id' })
  );
  return payload.value?.[0]?.id ?? null;
}

export function isBrandingThemeUnavailable(err) {
  const message = err instanceof Error ? err.message : String(err);
  return /branding\/themes/i.test(message) && /Request_ResourceNotFound|http-404/i.test(message);
}

/**
 * @param {string} tenantId
 * @param {string} themeName
 * @returns {Promise<{ orgId: string; theme: Record<string, unknown> | null; localization: Record<string, unknown> | null } | null>}
 */
export async function getContactBrandingTheme(tenantId, themeName) {
  const orgId = await getOrganizationId(tenantId);
  if (!orgId) return null;
  const trimmedName = themeName.trim();
  try {
    const themesPayload = /** @type {{ value?: Array<Record<string, unknown>> }} */ (
      await graphBetaRequest({ tenantId, path: `/organization/${orgId}/branding/themes` })
    );
    const theme =
      themesPayload.value?.find((item) => String(item.name ?? '').trim() === trimmedName) ?? null;
    let localization = null;
    if (theme?.id) {
      try {
        localization = /** @type {Record<string, unknown>} */ (
          await graphBetaRequest({
            tenantId,
            path: `/organization/${orgId}/branding/themes/${encodeURIComponent(String(theme.id))}/localizations/0`,
          })
        );
      } catch {
        localization = null;
      }
    }
    return { orgId, theme, localization };
  } catch {
    return null;
  }
}

/**
 * Prefer branding themes when present; fall back to tenant company branding (CIAM default).
 *
 * @param {string} tenantId
 * @param {string} themeName
 */
export async function getContactBrandingState(tenantId, themeName) {
  const themeState = await getContactBrandingTheme(tenantId, themeName);
  if (themeState?.theme?.id) {
    return themeState;
  }
  const companyState = await getDefaultBranding(tenantId);
  if (!companyState?.orgId) {
    return themeState;
  }
  return { orgId: companyState.orgId, theme: null, localization: companyState.localization };
}

/**
 * @param {string} tenantId
 * @param {string} orgId
 * @param {{ name: string; isDefaultTheme?: boolean }} body
 */
export async function createBrandingTheme(tenantId, orgId, body) {
  return graphBetaRequest({
    tenantId,
    method: 'POST',
    path: `/organization/${orgId}/branding/themes`,
    body: {
      '@odata.type': '#microsoft.graph.organizationalBrandingTheme',
      ...body,
    },
  });
}

/**
 * @param {string} tenantId
 * @param {string} orgId
 * @param {string} themeId
 * @param {{ name?: string; isDefaultTheme?: boolean }} body
 */
export async function patchBrandingTheme(tenantId, orgId, themeId, body) {
  return graphBetaRequest({
    tenantId,
    method: 'PATCH',
    path: `/organization/${orgId}/branding/themes/${encodeURIComponent(themeId)}`,
    body,
  });
}

/**
 * @param {string} tenantId
 * @param {string} orgId
 * @param {string} themeId
 * @param {string} locale
 * @param {Record<string, string>} body
 */
export async function patchBrandingThemeLocalization(tenantId, orgId, themeId, locale, body) {
  return graphBetaRequest({
    tenantId,
    method: 'PATCH',
    path: `/organization/${orgId}/branding/themes/${encodeURIComponent(themeId)}/localizations/${encodeURIComponent(locale)}`,
    body,
  });
}

/**
 * @param {string} tenantId
 * @param {string} orgId
 * @param {string} themeId
 * @param {string} locale
 * @param {Record<string, string>} body
 */
export async function createBrandingThemeLocalization(tenantId, orgId, themeId, locale, body) {
  return graphBetaRequest({
    tenantId,
    method: 'POST',
    path: `/organization/${orgId}/branding/themes/${encodeURIComponent(themeId)}/localizations`,
    body: { locale, ...body },
  });
}

/**
 * @param {string} tenantId
 * @param {string} orgId
 * @param {string} themeId
 * @param {string} locale
 * @param {Buffer} bytes
 * @param {string} contentType
 */
export async function uploadBrandingThemeBannerLogo(tenantId, orgId, themeId, locale, bytes, contentType) {
  return graphBetaRequest({
    tenantId,
    method: 'PUT',
    path: `/organization/${orgId}/branding/themes/${encodeURIComponent(themeId)}/localizations/${encodeURIComponent(locale)}/bannerLogo/$value`,
    rawBody: bytes,
    contentType,
  });
}

/**
 * @deprecated Use getContactBrandingTheme for CIAM user-flow sign-in pages.
 * @param {string} tenantId
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function getDefaultBranding(tenantId) {
  const orgId = await getOrganizationId(tenantId);
  if (!orgId) return null;
  try {
    const branding = /** @type {Record<string, unknown>} */ (
      await graphRequest({
        tenantId,
        path: `/organization/${orgId}/branding`,
        acceptLanguage: '0',
      })
    );
    let localization = null;
    try {
      localization = /** @type {Record<string, unknown>} */ (
        await graphRequest({
          tenantId,
          path: `/organization/${orgId}/branding/localizations/0`,
          acceptLanguage: '0',
        })
      );
    } catch {
      localization = null;
    }
    return { orgId, branding, localization };
  } catch {
    return null;
  }
}

/**
 * @param {string} tenantId
 * @param {string} orgId
 * @param {string} locale
 * @param {Record<string, string>} body
 */
export async function createBrandingLocalization(tenantId, orgId, locale, body) {
  return graphRequest({
    tenantId,
    method: 'POST',
    path: `/organization/${orgId}/branding/localizations`,
    acceptLanguage: locale,
    body: {
      '@odata.type': '#microsoft.graph.organizationalBrandingLocalization',
      locale,
      ...body,
    },
  });
}

/**
 * @param {string} tenantId
 * @param {string} orgId
 * @param {string} locale
 * @param {Record<string, string>} body
 */
export async function patchBrandingLocalization(tenantId, orgId, locale, body) {
  return graphRequest({
    tenantId,
    method: 'PATCH',
    path: `/organization/${orgId}/branding/localizations/${encodeURIComponent(locale)}`,
    acceptLanguage: locale,
    body,
  });
}

/**
 * @param {string} tenantId
 * @param {string} orgId
 * @param {string} locale
 * @param {Buffer} bytes
 * @param {string} contentType
 */
export async function uploadBannerLogo(tenantId, orgId, locale, bytes, contentType) {
  return graphRequest({
    tenantId,
    method: 'PUT',
    path: `/organization/${orgId}/branding/localizations/${encodeURIComponent(locale)}/bannerLogo`,
    acceptLanguage: locale,
    rawBody: bytes,
    contentType,
  });
}

/**
 * @typedef {{
 *   identityProviders?: string;
 *   userFlow?: string;
 * }} ContactCiamReadFailures
 */

/**
 * @param {string} tenantId
 * @param {string} applicationClientId
 * @param {string[]} [idpGraphKeys]
 * @param {{ skipUserFlow?: boolean; brandingThemeName?: string }} [options]
 * @returns {Promise<{ flow: { id?: string; displayName?: string } | null; idps: Map<string, { id?: string; displayName?: string }>; branding: Record<string, unknown> | null; idpDetails: Map<string, Record<string, unknown>>; readFailures: ContactCiamReadFailures }>}
 */
export async function fetchRemoteContactCiamState(
  tenantId,
  applicationClientId,
  idpGraphKeys = [],
  options = {},
) {
  const themeName = String(options.brandingThemeName ?? 'Elyse Contact Accounts').trim();
  /** @type {ContactCiamReadFailures} */
  const readFailures = {};

  let flowSummary = null;
  if (!options.skipUserFlow && applicationClientId.trim()) {
    try {
      flowSummary = await findUserFlowForApplication(tenantId, applicationClientId);
    } catch (err) {
      if (isGraphAccessError(err)) {
        readFailures.userFlow = err instanceof Error ? err.message : String(err);
      } else {
        throw err;
      }
    }
  }

  let idps = new Map();
  try {
    idps = await listIdentityProvidersByKey(tenantId);
  } catch (err) {
    if (isGraphAccessError(err)) {
      readFailures.identityProviders = err instanceof Error ? err.message : String(err);
      idps = new Map();
    } else {
      throw err;
    }
  }

  const idpListEmpty = idps.size === 0;
  if (idpListEmpty && !readFailures.identityProviders) {
    try {
      await graphRequest({ tenantId, path: '/identity/identityProviders?$top=1' });
    } catch (err) {
      if (isGraphAccessError(err)) {
        readFailures.identityProviders = err instanceof Error ? err.message : String(err);
      } else {
        throw err;
      }
    }
  }

  const branding = await getContactBrandingState(tenantId, themeName);

  let flow = null;
  if (flowSummary?.id) {
    flow = await getAuthenticationEventsFlow(tenantId, flowSummary.id);
  }

  /** @type {Map<string, Record<string, unknown>>} */
  const idpDetails = new Map();
  for (const graphKey of idpGraphKeys) {
    const trimmed = String(graphKey ?? '').trim();
    if (!trimmed) continue;
    const listed =
      idps.get(trimmed) ??
      idps.get(trimmed.toLowerCase()) ??
      idps.get(trimmed.toUpperCase());
    const id = String(listed?.id ?? trimmed);
    const detail = (listed && listed.clientId !== undefined ? listed : null) ?? (await getIdentityProvider(tenantId, id));
    if (detail) {
      idpDetails.set(trimmed, detail);
      idpDetails.set(trimmed.toLowerCase(), detail);
    }
  }

  return { flow, idps, branding, idpDetails, readFailures };
}

/**
 * Export for tests — read JWT file without logging.
 * @param {string} filePath
 */
export function readTempTokenFile(filePath) {
  return readFileSync(filePath, 'utf8').trim();
}
