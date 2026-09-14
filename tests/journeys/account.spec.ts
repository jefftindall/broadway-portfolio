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

  test('ACCOUNT-03 account page includes lesson history chrome', async ({ page }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    test.skip(!contactAccountsEnabled, 'CONTACT_ACCOUNTS_ENABLED is false');
    const res = await page.goto('/account');
    expect(res?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'Lesson history' })).toBeAttached();
  });
});
