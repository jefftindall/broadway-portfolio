import { expect, test } from '@playwright/test';
import { sampleCastingSlug, sampleShowTitle } from '../helpers/content';
import { waitForOk, waitForRequestOk, isStaticWebAppHost } from '../helpers/propagation';

const castingSlug = sampleCastingSlug();
const showTitle = sampleShowTitle();

test.describe('public staging smoke', () => {
  test('home shows brand and Stage & reel', async ({ page }) => {
    await waitForOk(page, '/');
    await expect(page.getByRole('heading', { name: /Elyse Tindall/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Stage & reel/i })).toBeVisible();
  });

  test('shows page lists credits from content', async ({ page }) => {
    await waitForOk(page, '/shows');
    await expect(page.getByRole('heading', { name: 'Shows', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: new RegExp(showTitle, 'i') }).first()).toBeVisible();
  });

  test('gallery loads', async ({ page }) => {
    await waitForOk(page, '/gallery');
    await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
    await expect(page.locator('img').first()).toBeVisible();
  });

  test('lessons page loads', async ({ page }) => {
    await waitForOk(page, '/lessons');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByText(/voice|vocal|CCM|pedagogy/i).first()).toBeVisible();
  });

  test('lessons book page loads', async ({ page }) => {
    await waitForOk(page, '/lessons/book');
    await expect(page.getByRole('heading', { name: /Rates & scheduling/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rates', level: 2 })).toBeVisible();
  });

  test('news index loads', async ({ page }) => {
    await waitForOk(page, '/news');
    await expect(page.getByRole('heading', { name: 'News', level: 1 })).toBeVisible();
  });

  test('casting landing page loads', async ({ page }) => {
    await waitForOk(page, `/for/${castingSlug}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('materials page and downloads', async ({ page, request }) => {
    await waitForOk(page, '/materials');
    await expect(page.getByRole('heading', { name: 'Materials', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Resume \(PDF\)/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Theatrical headshot/i })).toBeVisible();

    const pdf = await waitForRequestOk(request, '/downloads/elyse-tindall-resume.pdf');
    const pdfType = pdf.headers()['content-type'] ?? '';
    expect(pdfType).toMatch(/pdf|octet-stream/i);
    const pdfBody = await pdf.body();
    expect(pdfBody.byteLength).toBeGreaterThan(500);

    const headshot = await waitForRequestOk(
      request,
      '/downloads/elyse-tindall-headshot-theatrical.jpg',
    );
    const headshotType = headshot.headers()['content-type'] ?? '';
    expect(headshotType).toMatch(/jpe?g|octet-stream/i);
    expect((await headshot.body()).byteLength).toBeGreaterThan(500);
  });

  test('about page loads', async ({ page }) => {
    await waitForOk(page, '/about');
    await expect(page.getByRole('heading', { name: 'About', level: 1 })).toBeVisible();
  });

  test('contact page loads', async ({ page }) => {
    await waitForOk(page, '/contact');
    await expect(page.getByRole('heading', { name: 'Contact', level: 1 })).toBeVisible();
  });

  test('robots.txt and sitemap are served', async ({ request }) => {
    const robots = await waitForRequestOk(request, '/robots.txt');
    const robotsText = await robots.text();
    expect(robotsText).toMatch(/Sitemap:/i);
    expect(robotsText).toMatch(/Disallow:\s*\/studio/i);

    const sitemap = await waitForRequestOk(request, '/sitemap-index.xml');
    expect(sitemap.headers()['content-type'] ?? '').toMatch(/xml/i);
    expect(await sitemap.text()).toMatch(/sitemap/i);
  });

  test('anonymous studio requires sign-in', async ({ request }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    const response = await request.get('/studio', { maxRedirects: 0 });
    expect(response.status(), 'studio should redirect unauthenticated users').toBeGreaterThanOrEqual(
      300,
    );
    expect(response.status()).toBeLessThan(400);
    const location = response.headers()['location'] ?? '';
    expect(location).toMatch(/\.auth\/login/i);
  });
});
