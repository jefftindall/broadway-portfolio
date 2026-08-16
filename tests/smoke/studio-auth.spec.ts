import { expect, test as base } from '@playwright/test';
import { unlinkSync } from 'node:fs';
import { generateTotp } from '../helpers/totp';
import { redactHarFile } from '../helpers/redactHar';
import { isStaticWebAppHost } from '../helpers/propagation';

const ready = process.env.MONITOR_AUTH_READY === '1';
const upn = process.env.MONITOR_UPN ?? '';
const password = process.env.MONITOR_PASSWORD ?? '';
const totpSeed = process.env.MONITOR_TOTP_SEED ?? '';

const test = base.extend({
  context: async ({ browser, baseURL, viewport, userAgent, isMobile, hasTouch, deviceScaleFactor }, use, testInfo) => {
    const harPath = testInfo.outputPath('auth.har');
    const context = await browser.newContext({
      baseURL,
      viewport,
      userAgent,
      isMobile,
      hasTouch,
      deviceScaleFactor,
      recordHar: { path: harPath, mode: 'minimal' },
    });
    await use(context);
    await context.close();
    redactHarFile(harPath);
    if (testInfo.status === 'passed' || testInfo.status === 'skipped') {
      try {
        unlinkSync(harPath);
      } catch {
        /* already gone */
      }
    }
  },
});

test.describe('studio auth smoke', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Studio login smoke is desktop-only (one Entra session).');
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    test.skip(
      !ready || !upn || !password || !totpSeed,
      'MONITOR-TOTP-SEED is REPLACE_ME — enroll software TOTP per docs/runbooks/studio-auth-monitoring.md',
    );
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    const passwordBox = page.locator('input[name="passwd"], input[type="password"]');
    await page
      .screenshot({
        path: testInfo.outputPath('failure-masked.png'),
        mask: [passwordBox],
        fullPage: true,
      })
      .catch(() => undefined);
  });

  test('signed-in monitor reaches /studio/health marker', async ({ page }) => {
    const marks: Record<string, number> = { start: Date.now() };

    await page.goto('/studio/health');
    await page.waitForURL(/login\.microsoftonline\.com/i, { timeout: 45_000 });
    marks.redirect = Date.now();

    const email = page.locator('input[name="loginfmt"], input[type="email"]');
    await email.waitFor({ state: 'visible', timeout: 30_000 });
    await email.fill(upn);
    await page.locator('input[type="submit"], #idSIButton9').first().click();

    const passwd = page.locator('input[name="passwd"], input[type="password"]');
    await passwd.waitFor({ state: 'visible', timeout: 30_000 });
    await passwd.fill(password);
    await page.locator('input[type="submit"], #idSIButton9').first().click();

    const otc = page.locator('input[name="otc"]');
    await expect(otc, 'Entra must prompt for an authenticator code (not push/number-match)').toBeVisible({
      timeout: 45_000,
    });
    await otc.fill(generateTotp(totpSeed));
    await page.locator('input[type="submit"], #idSIButton9').first().click();
    marks.idp = Date.now();

    const kmsiNo = page.locator('#idBtn_Back');
    try {
      await kmsiNo.waitFor({ state: 'visible', timeout: 8_000 });
      await kmsiNo.click();
    } catch {
      // KMSI ("Stay signed in?") is not always shown.
    }

    await page.waitForURL(/\/\.auth\/login\/aad\/callback|\/studio\/health/i, { timeout: 45_000 });
    marks.callback = Date.now();

    if (!/\/studio\/health/i.test(page.url())) {
      await page.waitForURL(/\/studio\/health/i, { timeout: 45_000 });
    }
    marks.render = Date.now();

    const marker = page.locator('[data-studio-health="ok"]');
    await expect(marker).toBeVisible();
    await expect(marker).toContainText('studio-health-ok');
    expect(page.url(), 'must not bounce back to Entra login').not.toMatch(/login\.microsoftonline\.com/i);

    const me = await page.request.get('/.auth/me');
    expect(me.ok(), '/.auth/me should succeed with the session cookie').toBeTruthy();
    await page.reload();
    await expect(page.locator('[data-studio-health="ok"]')).toBeVisible();

    test.info().annotations.push({
      type: 'studio-auth-timings-ms',
      description: JSON.stringify({
        timeToRedirectMs: marks.redirect - marks.start,
        timeAtIdpMs: marks.idp - marks.redirect,
        tokenExchangeMs: marks.callback - marks.idp,
        pageRenderMs: marks.render - marks.callback,
      }),
    });
  });
});
