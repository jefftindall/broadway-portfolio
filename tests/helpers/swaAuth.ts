import { expect, type APIRequestContext } from '@playwright/test';

const BROKEN_REDIRECT = /post_login_redirect_uri=%7burl%7d/i;

/**
 * SWA Easy Auth often redirects through one or more same-host hops
 * (e.g. staticWebAppsAuthNonce) before sending the browser to the external IdP.
 */
export async function expectAuthRedirectToExternalIdp(
  request: APIRequestContext,
  startPath: string,
  externalHost: RegExp,
  maxHops = 8,
) {
  let url = startPath;

  for (let hop = 0; hop < maxHops; hop += 1) {
    const res = await request.get(url, { maxRedirects: 0 });
    expect(res.status(), `${url} should redirect, not 404`).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);

    const location = res.headers()['location'] ?? '';
    expect(location, 'auth redirect must not use literal {url} placeholder').not.toMatch(
      BROKEN_REDIRECT,
    );

    if (externalHost.test(location)) return;

    const isSwaInternalHop =
      /staticWebAppsAuthNonce/i.test(location) ||
      (/\/\.auth\//i.test(location) && !externalHost.test(location));
    if (isSwaInternalHop) {
      url = location;
      continue;
    }

    throw new Error(
      `Auth redirect chain stopped at hop ${hop + 1} without reaching external IdP: ${location || '(empty)'}`,
    );
  }

  throw new Error(`Auth redirect chain exceeded ${maxHops} hops from ${startPath}`);
}
