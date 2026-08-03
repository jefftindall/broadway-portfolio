import { expect, test } from '@playwright/test';
import { waitForOk } from '../helpers/propagation';

test.describe('lessons journeys', () => {
  test('LESSON-01 book a lesson flow', async ({ page }) => {
    await waitForOk(page, '/lessons');
    await expect(page.getByRole('heading', { name: /Vocal coaching/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vocal Pedagogy & Technique' })).toBeVisible();
    await expect(page.getByText(/private voice lessons/i).first()).toBeVisible();

    await page.getByRole('link', { name: 'Book a lesson' }).first().click();
    await expect(page).toHaveURL(/\/lessons\/book\/?$/);
    await expect(page.getByRole('heading', { name: /Rates & scheduling/i })).toBeVisible();
    await expect(page.getByText('30-minute session')).toBeVisible();
    await expect(page.getByText('60-minute session')).toBeVisible();
    await expect(page.getByText(/\$60/)).toBeVisible();
    await expect(page.getByText(/\$100/)).toBeVisible();

    await page.getByRole('link', { name: /Send lesson inquiry/i }).first().click();
    await expect(page.locator('#lesson-inquiry')).toBeVisible();
    await expect(page.getByTestId('lesson-submit')).toBeVisible();
    await expect(page.getByText(/not acting, monologue, or scene-study coaching/i)).toBeVisible();
    await expect(page.getByText(/voice lessons|vocal pedagogy|CCM/i).first()).toBeVisible();
  });

  test('LESSON-02 contact lesson form', async ({ page }) => {
    await waitForOk(page, '/contact');
    await expect(page.locator('#lesson-inquiry')).toBeVisible();
    await expect(page.getByTestId('lesson-submit')).toBeVisible();
    await expect(page.getByTestId('lesson-format-nyc')).toBeVisible();
  });

  test('LESSON-01 mobile book flow', { tag: '@mobile' }, async ({ page }) => {
    await waitForOk(page, '/lessons');
    await page.getByRole('link', { name: 'Book a lesson' }).first().click();
    await expect(page).toHaveURL(/\/lessons\/book\/?$/);
    await expect(page.getByRole('link', { name: /Send lesson inquiry/i }).first()).toBeVisible();
    await expect(page.locator('#lesson-inquiry')).toBeVisible();
  });
});
