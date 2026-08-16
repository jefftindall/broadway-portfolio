import { expect, type Page } from '@playwright/test';
import { generateTotp } from './totp';

async function visible(locator: { isVisible: () => Promise<boolean> }): Promise<boolean> {
  return locator.isVisible().catch(() => false);
}

/**
 * Complete SWA Easy Auth → Entra login (password, optional software TOTP, KMSI).
 * Fails fast on "Need admin approval" (identifier URI / missing admin consent).
 */
export async function completeEntraLogin(page: Page, upn: string, password: string, totpSeed: string) {
  const email = page.locator('input[name="loginfmt"], input[type="email"]');
  await email.waitFor({ state: 'visible', timeout: 30_000 });
  await email.fill(upn);
  await page.locator('input[type="submit"], #idSIButton9').first().click();

  const passwd = page.locator('input[name="passwd"], input[type="password"]');
  await passwd.waitFor({ state: 'visible', timeout: 30_000 });
  await passwd.fill(password);
  await page.locator('input[type="submit"], #idSIButton9').first().click();

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (!/login\.microsoftonline\.com/i.test(page.url())) {
      return;
    }

    if (await visible(page.getByRole('heading', { name: /Need admin approval/i }))) {
      throw new Error(
        'Entra Need admin approval — grant admin consent on the SWA app after exposing Monitor.Ping / identifier URI (see docs/runbooks/studio-auth-monitoring.md).',
      );
    }

    const otc = page.locator('input[name="otc"]');
    if (await visible(otc)) {
      await otc.fill(generateTotp(totpSeed));
      await page.locator('input[type="submit"], #idSIButton9').first().click();
      await page.waitForLoadState('domcontentloaded');
      continue;
    }

    const otherWays = page.getByRole('link', {
      name: /other ways to sign in|I can't use my Microsoft Authenticator|sign in another way/i,
    });
    if (await visible(otherWays)) {
      await otherWays.click();
      continue;
    }

    const totpMethod = page.getByRole('button', {
      name: /verification code|use a code|authenticator app|mobile app/i,
    });
    if (await visible(totpMethod)) {
      await totpMethod.click();
      continue;
    }

    const staySignedIn = page.getByRole('heading', { name: /Stay signed in/i });
    if (await visible(staySignedIn)) {
      await page.getByRole('button', { name: /^No$/i }).or(page.locator('#idBtn_Back')).first().click();
      await page.waitForLoadState('domcontentloaded');
      continue;
    }

    await page.waitForTimeout(400);
  }

  expect(page.url(), 'Entra login should leave login.microsoftonline.com').not.toMatch(
    /login\.microsoftonline\.com/i,
  );
}
