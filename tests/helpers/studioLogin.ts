import { expect, type Page } from '@playwright/test';

/**
 * Start workforce Entra login from an authenticated Studio entry path.
 * Uses the /login chooser when present; falls back to direct /.auth/login/aad
 * when the chooser click does not reach Microsoft (e.g. transient SWA auth issues).
 */
export async function beginStudioEntraLogin(page: Page, entryPath = '/studio/health') {
  const redirectPath = entryPath.startsWith('/') ? entryPath : '/studio/health';
  const directAad = `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(redirectPath)}`;

  await page.goto(entryPath);

  if (/login\.microsoftonline\.com/i.test(page.url())) return;

  await page.waitForURL(/\/login(\?|$)|login\.microsoftonline\.com|\/studio/i, {
    timeout: 45_000,
  });

  if (/login\.microsoftonline\.com/i.test(page.url())) return;

  if (/\/login(\?|$)/i.test(page.url())) {
    const operator = page.getByTestId('login-operator');
    await expect(operator).toBeVisible();

    await operator.click();
    try {
      await page.waitForURL(/login\.microsoftonline\.com/i, { timeout: 12_000 });
      return;
    } catch {
      const probe = await page.request.get(directAad, { maxRedirects: 0 });
      const status = probe.status();
      if (status >= 300 && status < 400) {
        const location = probe.headers()['location'] ?? '';
        if (/login\.microsoftonline\.com/i.test(location)) {
          await page.goto(directAad);
        } else {
          throw new Error(
            `Studio AAD login redirect did not reach Entra (HTTP ${status}; location=${location || 'none'})`,
          );
        }
      } else {
        throw new Error(
          `Studio AAD login route failed (HTTP ${status}); SWA auth may be misconfigured`,
        );
      }
    }
  } else if (!/login\.microsoftonline\.com/i.test(page.url())) {
    const probe = await page.request.get(directAad, { maxRedirects: 0 });
    const status = probe.status();
    if (status >= 300 && status < 400) {
      await page.goto(directAad);
    } else {
      throw new Error(`Could not start Studio login from ${page.url()} (AAD probe HTTP ${status})`);
    }
  }

  await page.waitForURL(/login\.microsoftonline\.com/i, { timeout: 45_000 });
}
