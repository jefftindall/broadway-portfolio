import { expect, test } from '@playwright/test';
import { fetchContactAccountsEnabled } from '../helpers/contactAccounts';
import { isStaticWebAppHost, waitForOk, waitForRequestOk } from '../helpers/propagation';
import { expectAuthRedirectToExternalIdp } from '../helpers/swaAuth';

test.describe('contact accounts smoke', () => {
  let contactAccountsEnabled = false;

  test.beforeAll(async ({ request }) => {
    if (!isStaticWebAppHost()) return;
    contactAccountsEnabled = await fetchContactAccountsEnabled(request);
  });

  test('contactAccountConfig reports deployed flag', async ({ request }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    const res = await waitForRequestOk(request, '/api/contactAccountConfig');
    const json = (await res.json()) as { enabled?: unknown };
    expect(json.enabled).toBe(contactAccountsEnabled);
  });

  test('workforce AAD auth route responds when contact accounts disabled', async ({ request }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    test.skip(contactAccountsEnabled, 'covered alongside contact login when enabled');
    await expectAuthRedirectToExternalIdp(
      request,
      '/.auth/login/aad?post_login_redirect_uri=%2Fstudio',
      /login\.microsoftonline\.com/i,
    );
  });

  test('login chooser exposes student and operator paths when enabled', async ({ page }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    test.skip(!contactAccountsEnabled, 'CONTACT_ACCOUNTS_ENABLED is false');
    await waitForOk(page, '/login');
    await expect(page.getByTestId('login-contact')).toBeVisible();
    await expect(page.getByTestId('login-operator')).toBeVisible();
  });

  test('contact auth starts CIAM login when enabled', async ({ request }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    test.skip(!contactAccountsEnabled, 'CONTACT_ACCOUNTS_ENABLED is false');
    await expectAuthRedirectToExternalIdp(
      request,
      '/.auth/login/contact?post_login_redirect_uri=%2Flessons%2Fbook',
      /ciamlogin\.com/i,
    );
  });

  test('anonymous /account redirects when enabled', async ({ request }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    test.skip(!contactAccountsEnabled, 'CONTACT_ACCOUNTS_ENABLED is false');
    const res = await request.get('/account', { maxRedirects: 0 });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    expect(res.headers()['location'] ?? '').toMatch(/\/login|\.auth\/login/i);
  });

  test('nav hides account chrome when disabled', async ({ page }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    test.skip(contactAccountsEnabled, 'only when CONTACT_ACCOUNTS_ENABLED is false');
    await waitForOk(page, '/');
    await expect(page.locator('#nav-account-slot')).toBeHidden();
  });

  test('nav shows Sign in when enabled', async ({ page }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    test.skip(!contactAccountsEnabled, 'CONTACT_ACCOUNTS_ENABLED is false');
    await waitForOk(page, '/');
    await expect(page.locator('#nav-account-slot a')).toHaveText('Sign in', { timeout: 20_000 });
  });
});
