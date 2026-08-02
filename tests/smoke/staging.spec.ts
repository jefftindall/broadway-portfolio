import { expect, test, type Page } from '@playwright/test';

const PROPAGATION_DEADLINE_MS = 4 * 60 * 1000;
const PROPAGATION_POLL_MS = 5_000;

/** Wait until staging serves HTTP 200 for a path (SWA CDN propagation). */
async function waitForOk(page: Page, path: string) {
  const deadline = Date.now() + PROPAGATION_DEADLINE_MS;
  let lastStatus = 0;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      lastStatus = response?.status() ?? 0;
      if (lastStatus >= 200 && lastStatus < 400) return response!;
      lastError = `HTTP ${lastStatus}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await page.waitForTimeout(PROPAGATION_POLL_MS);
  }
  throw new Error(`Timed out waiting for ${path} (last: ${lastError || lastStatus})`);
}

test.describe('public staging smoke', () => {
  test('home shows brand and Stage & reel', async ({ page }) => {
    await waitForOk(page, '/');
    await expect(page.getByRole('heading', { name: /Elyse Tindall/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Stage & reel/i })).toBeVisible();
  });

  test('shows page lists credits', async ({ page }) => {
    await waitForOk(page, '/shows');
    await expect(page.getByRole('heading', { name: 'Shows', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /The Little Mermaid|Site 19|Anastasia/i }).first()).toBeVisible();
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

  test('materials page and resume PDF', async ({ page, request }) => {
    await waitForOk(page, '/materials');
    await expect(page.getByRole('heading', { name: 'Materials', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Resume \(PDF\)/i })).toBeVisible();

    const pdf = await request.get('/downloads/elyse-tindall-resume.pdf');
    expect(pdf.status()).toBe(200);
    const contentType = pdf.headers()['content-type'] ?? '';
    expect(contentType).toMatch(/pdf|octet-stream/i);
    const body = await pdf.body();
    expect(body.byteLength).toBeGreaterThan(500);
  });

  test('about page loads', async ({ page }) => {
    await waitForOk(page, '/about');
    await expect(page.getByRole('heading', { name: 'About', level: 1 })).toBeVisible();
  });

  test('contact page loads', async ({ page }) => {
    await waitForOk(page, '/contact');
    await expect(page.getByRole('heading', { name: 'Contact', level: 1 })).toBeVisible();
  });
});
