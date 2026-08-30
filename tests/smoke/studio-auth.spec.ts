import { expect, test as base } from '@playwright/test';
import { unlinkSync } from 'node:fs';
import { completeEntraLogin } from '../helpers/entraLogin';
import { redactHarFile } from '../helpers/redactHar';
import { isStaticWebAppHost } from '../helpers/propagation';
import { beginStudioEntraLogin } from '../helpers/studioLogin';

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

    await beginStudioEntraLogin(page, '/studio/health');
    marks.redirect = Date.now();

    await completeEntraLogin(page, upn, password, totpSeed);
    marks.idp = Date.now();

    // 401 override sends unauthenticated users to /login, then operator path returns here.
    await page.waitForURL(/\/studio(\/health)?\/?(\?|$)/i, { timeout: 45_000 });
    expect(page.url(), 'must not bounce back to Entra login').not.toMatch(/login\.microsoftonline\.com/i);
    const me = await page.request.get('/.auth/me');
    expect(me.ok(), '/.auth/me should succeed').toBeTruthy();
    const meJson = (await me.json()) as { clientPrincipal?: { userId?: string } | null };
    expect(meJson?.clientPrincipal?.userId, 'SWA session cookie').toBeTruthy();
    marks.callback = Date.now();

    // 401 override always returns to /studio, and a top-level navigation to
    // /studio/health re-enters that override. The session can still fetch the
    // canary (page.request shares the SWA auth cookies).
    const health = await page.request.get('/studio/health');
    expect(health.ok(), '/studio/health should be 200 with the session cookie').toBeTruthy();
    const html = await health.text();
    expect(html).toContain('data-studio-health="ok"');
    expect(html).toContain('studio-health-ok');
    expect(html, 'must not be the Entra login page').not.toMatch(/login\.microsoftonline\.com/i);
    marks.render = Date.now();

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
