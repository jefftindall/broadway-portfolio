import { expect, test } from '@playwright/test';
import { fetchContactAccountsEnabled } from '../helpers/contactAccounts';
import { isStaticWebAppHost, waitForOk } from '../helpers/propagation';

test.describe('lessons journeys', () => {
  let contactAccountsEnabled = false;

  test.beforeAll(async ({ request }) => {
    if (!isStaticWebAppHost()) return;
    contactAccountsEnabled = await fetchContactAccountsEnabled(request);
  });
  test('LESSON-01 book a lesson flow', async ({ page }) => {
    await waitForOk(page, '/lessons');
    await expect(page.getByRole('heading', { name: /Vocal coaching/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vocal Pedagogy & Technique' })).toBeVisible();
    await expect(page.getByText(/private voice lessons/i).first()).toBeVisible();

    await page.getByRole('link', { name: 'Book a lesson' }).first().click();
    await expect(page).toHaveURL(/\/lessons\/book\/?$/);
    await expect(page.getByRole('heading', { name: /Rates & scheduling/i })).toBeVisible();
    const ratesList = page.locator('#booking-heading ul');
    await expect(ratesList.getByText('30-minute session', { exact: true })).toBeVisible();
    await expect(ratesList.getByText('60-minute session', { exact: true })).toBeVisible();
    await expect(ratesList.getByText('$60')).toBeVisible();
    await expect(ratesList.getByText('$100')).toBeVisible();

    await page.getByRole('link', { name: /Send lesson inquiry/i }).first().click();
    await expect(page.locator('#lesson-inquiry')).toBeVisible();
    await expect(page.getByTestId('lesson-submit')).toBeVisible();
    await expect(page.getByText(/not acting, monologue, or scene-study coaching/i)).toBeVisible();
    await expect(page.getByText(/voice lessons|vocal pedagogy|CCM/i).first()).toBeVisible();

    const payCta = page.getByTestId('lesson-pay-30min');
    if ((await payCta.count()) > 0) {
      await expect(payCta).toBeVisible();
      await expect(payCta).toHaveAttribute('href', /https:\/\/buy\.stripe\.com\//);
      await expect(
        page.locator('#booking-heading').getByText(/private voice lessons only/i),
      ).toBeVisible();
    }
  });

  test('LESSON-02 lesson inquiry form', async ({ page }) => {
    await waitForOk(page, '/lessons/book');
    await expect(page.locator('#lesson-inquiry')).toBeVisible();
    await expect(page.getByTestId('lesson-submit')).toBeVisible();
    await expect(page.getByTestId('lesson-format-nyc')).toBeVisible();
    await expect(page.getByRole('link', { name: /Casting or representation/i })).toBeVisible();
  });

  test('LESSON-02b contact page points to lessons', async ({ page }) => {
    await waitForOk(page, '/contact');
    await expect(page.locator('#casting-inquiry')).toBeVisible();
    await expect(page.locator('#lesson-inquiry')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Looking for lessons/i })).toBeVisible();
  });

  test('LESSON-03 paid-lesson legal copy', async ({ page }) => {
    await waitForOk(page, '/privacy');
    await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible();
    await expect(page.getByText(/Stripe/i).first()).toBeVisible();
    await expect(page.getByText(/does not sell acting lessons/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Studio CRM' })).toBeVisible();
    await expect(page.getByText(/Azure Table Storage/i).first()).toBeVisible();

    await waitForOk(page, '/terms');
    await expect(page.getByRole('heading', { name: 'Paid voice lessons' })).toBeVisible();
    await expect(page.getByText(/Cancel at least 24 hours/i)).toBeVisible();
    await expect(page.getByText(/Payments are processed by Stripe/i)).toBeVisible();
    // Stated in both Site purpose and Voice lessons — do not use a bare locator.
    await expect(page.getByText(/does not offer acting lessons/i).first()).toBeVisible();
  });

  test('LESSON-01 mobile book flow', { tag: '@mobile' }, async ({ page }) => {
    await waitForOk(page, '/lessons');
    await page.getByRole('link', { name: 'Book a lesson' }).first().click();
    await expect(page).toHaveURL(/\/lessons\/book\/?$/);
    await expect(page.getByRole('link', { name: /Send lesson inquiry/i }).first()).toBeVisible();
    await expect(page.locator('#lesson-inquiry')).toBeVisible();
  });

  test('LESSON-04 lesson inquiry stays anonymous when contact accounts enabled', async ({
    page,
  }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    test.skip(!contactAccountsEnabled, 'CONTACT_ACCOUNTS_ENABLED is false');
    await waitForOk(page, '/lessons/book');
    await expect(page.locator('#lesson-inquiry')).toBeVisible();
    await expect(page.getByTestId('lesson-submit')).toBeVisible();
  });

  test('LESSON-05 schedule section when contact accounts enabled', async ({ page }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    test.skip(!contactAccountsEnabled, 'CONTACT_ACCOUNTS_ENABLED is false');
    await waitForOk(page, '/lessons/book');
    await expect(page.locator('#lesson-schedule')).toBeVisible();
    await expect(page.getByTestId('lesson-schedule-signin')).toBeVisible();
    await expect(page.locator('#lesson-inquiry')).toBeVisible();
  });

  test('LESSON-06 account hint when contact accounts enabled', async ({ page }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    test.skip(!contactAccountsEnabled, 'CONTACT_ACCOUNTS_ENABLED is false');
    await waitForOk(page, '/lessons/book');
    await expect(page.getByTestId('lesson-account-hint')).toBeVisible();
    await expect(page.getByTestId('lesson-account-hint')).toContainText(/view your lesson history/i);
  });
});
