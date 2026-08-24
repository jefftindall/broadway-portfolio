import { expect, test, type APIRequestContext } from '@playwright/test';
import { sampleCastingSlug, sampleShowTitle } from '../helpers/content';
import { waitForOk, waitForRequestOk, isStaticWebAppHost, expectsStagingNoIndex } from '../helpers/propagation';

const castingSlug = sampleCastingSlug();
const showTitle = sampleShowTitle();

test.describe('public smoke', () => {
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
    if (expectsStagingNoIndex()) {
      expect(robotsText).toMatch(/Disallow:\s*\/\s*$/m);
      expect(robotsText).not.toMatch(/Sitemap:/i);
      const home = await waitForRequestOk(request, '/');
      expect(home.headers()['x-robots-tag'] ?? '').toMatch(/noindex/i);
    } else {
      expect(robotsText).toMatch(/Sitemap:/i);
      expect(robotsText).toMatch(/Disallow:\s*\/studio/i);
    }

    const sitemap = await waitForRequestOk(request, '/sitemap-index.xml');
    expect(sitemap.headers()['content-type'] ?? '').toMatch(/xml/i);
    expect(await sitemap.text()).toMatch(/sitemap/i);
  });

  test('anonymous studio requires sign-in', async ({ request }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    await expectAnonymousStudioRedirect(request, '/studio');
    await expectAnonymousStudioRedirect(request, '/studio/content');
    await expectAnonymousStudioRedirect(request, '/studio/career');
    await expectAnonymousStudioRedirect(request, '/studio/students');
    await expectAnonymousStudioRedirect(request, '/studio/admin');
    await expectAnonymousStudioRedirect(request, '/studio/admin/access');
    await expectAnonymousStudioRedirect(request, '/studio/admin/calendar');
    await expectAnonymousStudioRedirect(request, '/studio/calendar');
  });

  test('anonymous studio people requires sign-in', async ({ request }) => {
    test.skip(!isStaticWebAppHost(), 'SWA auth is only enforced on deployed hosts');
    await expectAnonymousStudioRedirect(request, '/studio/people');
    await expectAnonymousStudioRedirect(request, '/studio/people/person');
  });
});

async function expectAnonymousStudioRedirect(request: APIRequestContext, path: string) {
  let response = await request.get(path, { maxRedirects: 0 });
  expect(response.status(), `${path} should redirect unauthenticated users`).toBeGreaterThanOrEqual(
    300,
  );
  expect(response.status()).toBeLessThan(400);
  let location = response.headers()['location'] ?? '';

  // When BASE_URL is *.azurestaticapps.net and a custom domain is SWA's default,
  // Azure 301s /studio to https://<custom>/studio before the auth challenge.
  // Follow one hop so we still assert Entra login (prod smoke prefers the apex).
  const pathEscaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!/\.auth\/login/i.test(location) && new RegExp(`${pathEscaped}/?(\\?|$)`, 'i').test(location)) {
    response = await request.get(location, { maxRedirects: 0 });
    expect(
      response.status(),
      `canonical-domain ${path} should still redirect unauthenticated users`,
    ).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    location = response.headers()['location'] ?? '';
  }

  expect(location).toMatch(/\.auth\/login/i);
  // Auth 302s must not inherit the public HTML max-age or browsers replay
  // login after Entra returns to /studio (staging hostname and prod apex).
  expect(response.headers()['cache-control'] ?? '').toMatch(/no-store/i);
}

