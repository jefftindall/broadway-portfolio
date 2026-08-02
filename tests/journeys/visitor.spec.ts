import { expect, test } from '@playwright/test';
import { newestNewsPost, primaryNav } from '../helpers/content';
import { waitForOk } from '../helpers/propagation';

const latestNews = newestNewsPost();

test.describe('visitor journeys', () => {
  test('VISIT-01 news list to article', async ({ page }) => {
    await waitForOk(page, '/news');
    await expect(page.getByRole('heading', { name: 'News', level: 1 })).toBeVisible();

    const postLink = page.getByRole('link', { name: new RegExp(latestNews.title, 'i') });
    await expect(postLink).toBeVisible();
    await postLink.click();

    await expect(page).toHaveURL(new RegExp(`/news/${latestNews.slug}/?$`));
    await expect(page.getByRole('heading', { level: 1, name: latestNews.title })).toBeVisible();
    await expect(page.getByRole('link', { name: /All news/i })).toBeVisible();
  });

  test('VISIT-02 gallery images load', async ({ page }) => {
    await waitForOk(page, '/gallery');
    const image = page.locator('[data-gallery] img').first();
    await expect(image).toBeVisible();
    await expect
      .poll(async () => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
  });

  test('VISIT-03 primary navigation from home', async ({ page }) => {
    await waitForOk(page, '/');

    for (const item of primaryNav) {
      await page.goto('/');
      const nav = page.getByRole('navigation', { name: 'Primary' });
      await nav.getByRole('link', { name: item.label, exact: true }).click();
      const pathPattern =
        item.href === '/' ? /\/$/ : new RegExp(`${item.href.replace('/', '\\/')}\\/?$`);
      await expect(page).toHaveURL(pathPattern);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    }
  });

  test('VISIT-04 mobile menu to shows @mobile', async ({ page }) => {
    await waitForOk(page, '/');
    await page.getByText('Menu', { exact: true }).click();
    await page.getByRole('link', { name: 'Shows' }).click();
    await expect(page).toHaveURL(/\/shows\/?$/);
    await expect(page.getByRole('heading', { name: 'Shows', level: 1 })).toBeVisible();
  });
});
