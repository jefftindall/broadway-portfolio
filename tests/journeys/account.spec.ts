import { expect, test } from '@playwright/test';
import { fetchContactAccountsEnabled } from '../helpers/contactAccounts';
import { isStaticWebAppHost, waitForOk } from '../helpers/propagation';

test.describe('account journeys', () => {
  let contactAccountsEnabled = false;

  test.beforeAll(async ({ request }) => {
    if (!isStaticWebAppHost()) return;
    contactAccountsEnabled = await fetchContactAccountsEnabled(request);
  });

  test('ACCOUNT-01 anonymous /account redirects to login when enabled', async ({ request }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    test.skip(!contactAccountsEnabled, 'CONTACT_ACCOUNTS_ENABLED is false');
    const res = await request.get('/account', { maxRedirects: 0 });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    expect(res.headers()['location'] ?? '').toMatch(/\/login|\.auth\/login/i);
  });

  test('ACCOUNT-02 account page loads form chrome when flag on', async ({ page }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    test.skip(!contactAccountsEnabled, 'CONTACT_ACCOUNTS_ENABLED is false');
    await waitForOk(page, '/login');
    await expect(page.getByTestId('login-contact')).toBeVisible();
    // Signed-in save path is covered by API unit tests until CIAM journey auth is available.
  });

  test('ACCOUNT-03 accountLessons API is deployed and gated when enabled', async ({ request }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    test.skip(!contactAccountsEnabled, 'CONTACT_ACCOUNTS_ENABLED is false');
    // Signed-in /account lesson history UI is covered by API unit tests until CIAM journey auth (P1-014).
    const res = await request.get('/api/accountLessons', { maxRedirects: 0 });
    expect(res.status()).toBe(401);
    const json = (await res.json()) as { error?: string };
    expect(json.error ?? '').toMatch(/sign in/i);
  });
});
