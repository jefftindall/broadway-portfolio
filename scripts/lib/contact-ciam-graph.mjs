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

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  throw new Error(message);
}

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
      // fall through to login
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
 * }} options
 */
export async function graphRequest({ tenantId, method = 'GET', path, body, accessToken }) {
  const token = accessToken ?? (await getGraphAccessToken(tenantId));
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
  const payload = /** @type {{ value?: Array<{ id?: string; displayName?: string }> }} */ (
    await graphRequest({
      tenantId,
      path: `/identity/authenticationEventsFlows?$filter=${filter}`,
    })
  );
  const flows = payload.value ?? [];
  return flows[0] ?? null;
}

/**
 * @param {string} tenantId
 * @returns {Promise<Map<string, { id?: string; displayName?: string }>>}
 */
export async function listIdentityProvidersByKey(tenantId) {
  const payload = /** @type {{ value?: Array<{ id?: string; displayName?: string }> }} */ (
    await graphRequest({ tenantId, path: '/identity/identityProviders' })
  );
  const map = new Map();
  for (const idp of payload.value ?? []) {
    if (idp.id) map.set(idp.id, idp);
    if (idp.displayName) map.set(idp.displayName, idp);
  }
  return map;
}

/**
 * @param {string} tenantId
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function getDefaultBranding(tenantId) {
  const payload = /** @type {{ value?: Record<string, unknown>[] }} */ (
    await graphRequest({ tenantId, path: '/organization?$select=id,displayName' })
  );
  const orgId = payload.value?.[0]?.id;
  if (!orgId) return null;
  try {
    return /** @type {Record<string, unknown>} */ (
      await graphRequest({ tenantId, path: `/organization/${orgId}/branding` })
    );
  } catch {
    return null;
  }
}

/**
 * @param {string} tenantId
 * @returns {Promise<{ flow: { id?: string; displayName?: string } | null; idps: Map<string, { id?: string; displayName?: string }>; branding: Record<string, unknown> | null }>}
 */
export async function fetchRemoteContactCiamState(tenantId, applicationClientId) {
  const [flow, idps, branding] = await Promise.all([
    findUserFlowForApplication(tenantId, applicationClientId),
    listIdentityProvidersByKey(tenantId),
    getDefaultBranding(tenantId),
  ]);
  return { flow, idps, branding };
}

/**
 * Export for tests — read JWT file without logging.
 * @param {string} filePath
 */
export function readTempTokenFile(filePath) {
  return readFileSync(filePath, 'utf8').trim();
}
