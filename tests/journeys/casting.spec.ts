import { expect, test } from '@playwright/test';
import {
  castingPageExpectations,
  filmShowTitle,
  musicalShowTitle,
  sampleCastingSlug,
} from '../helpers/content';
import { expectMailto, waitForOk, waitForRequestOk } from '../helpers/propagation';

const castingSlug = sampleCastingSlug();
const { title: castingTitle, cta: castingCta } = castingPageExpectations(castingSlug);
const musicalTitle = musicalShowTitle();
const filmTitle = filmShowTitle();

test.describe('casting journeys', () => {
  test('CAST-01 materials EPK flow', { tag: '@content' }, async ({ page, request }) => {
    await waitForOk(page, '/');
    await page.getByRole('link', { name: /Request materials/i }).click();
    await expect(page).toHaveURL(/\/materials\/?$/);
    await expect(page.getByRole('heading', { name: 'Materials', level: 1 })).toBeVisible();
    await expect(page.locator('iframe[title*="reel" i], iframe[src*="youtube"]').first()).toBeVisible();

    const resumeLink = page.getByRole('link', { name: /Resume \(PDF\)/i });
    await expect(resumeLink).toBeVisible();
    const resume = await waitForRequestOk(request, '/downloads/elyse-tindall-resume.pdf');
    expect(resume.status()).toBe(200);

    const headshot = await waitForRequestOk(
      request,
      '/downloads/elyse-tindall-headshot-theatrical.jpg',
    );
    expect(headshot.status()).toBe(200);

    const castingEmail = page.getByRole('link', { name: /Email casting inquiry/i }).first();
    await expect(castingEmail).toBeVisible();
    expectMailto(await castingEmail.getAttribute('href'), 'Casting Inquiry');
  });

  test('CAST-02 shows filter by musical', { tag: '@content' }, async ({ page }) => {
    await waitForOk(page, '/shows');
    await expect(page.getByRole('heading', { name: 'Shows', level: 1 })).toBeVisible();

    await page.getByRole('tab', { name: 'Musical' }).click();
    await expect(page.getByRole('tab', { name: 'Musical' })).toHaveAttribute('aria-selected', 'true');

    const musicalCredit = page.locator('.credit-item[data-category="musical"]').filter({
      has: page.getByRole('heading', { name: new RegExp(musicalTitle, 'i') }),
    });
    await expect(musicalCredit).toBeVisible();

    const filmCredit = page.locator('.credit-item[data-category="film"]').filter({
      has: page.getByRole('heading', { name: new RegExp(filmTitle, 'i') }),
    });
    await expect(filmCredit).toBeHidden();
  });

  test('CAST-03 casting landing CTA and contact', { tag: '@content' }, async ({ page }) => {
    await waitForOk(page, `/for/${castingSlug}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      castingTitle.replace(/\s*\|\s*Elyse Tindall$/i, ''),
    );

    const cta = page.getByRole('link', { name: castingCta });
    await expect(cta).toBeVisible();
    expectMailto(await cta.getAttribute('href'), castingCta);

    await page.locator('article').getByRole('link', { name: 'Contact' }).click();
    await expect(page).toHaveURL(/\/contact\/?$/);
    await expect(page.getByRole('heading', { name: 'Contact', level: 1 })).toBeVisible();
  });

  test('CAST-04 mobile materials in two taps', { tag: ['@content', '@mobile'] }, async ({ page }) => {
    await waitForOk(page, '/');
    await page.getByRole('link', { name: /Request materials/i }).click();
    await expect(page).toHaveURL(/\/materials\/?$/);
    await expect(page.getByRole('heading', { name: 'Materials', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Resume \(PDF\)/i })).toBeVisible();
  });
});
