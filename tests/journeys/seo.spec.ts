import { expect, test } from '@playwright/test';
import { sampleCastingSlug } from '../helpers/content';
import { waitForOk, waitForRequestOk, expectsStagingNoIndex } from '../helpers/propagation';

const castingSlug = sampleCastingSlug();

const samplePaths = ['/', '/shows', '/materials', `/for/${castingSlug}`] as const;

test.describe('J-SEO-01 technical SEO', () => {
  for (const path of samplePaths) {
    test(`head tags on ${path}`, async ({ page }) => {
      await waitForOk(page, path);

      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
      expect(title).toMatch(/Elyse Tindall/);

      if (path.startsWith('/for/')) {
        expect(title).not.toMatch(/\|\s*Elyse Tindall\s*·\s*Elyse Tindall/);
      }

      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveCount(1);
      const href = await canonical.getAttribute('href');
      expect(href).toBeTruthy();
      if (path === '/') {
        expect(href!).toMatch(/^https:\/\/elysetindall\.com\/?$/);
      } else {
        expect(href!).not.toMatch(/\/$/);
        expect(href!).toContain(path);
      }

      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /.+/);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /https?:\/\//);
    });
  }

  test('default OG metas when using og-default.jpg', async ({ page }) => {
    await waitForOk(page, `/for/${castingSlug}`);
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage).toContain('/images/og-default.jpg');
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', /Elyse Tindall/);
  });

  test('robots.txt Disallow /studio and Sitemap', async ({ request }) => {
    const robots = await waitForRequestOk(request, '/robots.txt');
    const text = await robots.text();
    if (expectsStagingNoIndex()) {
      expect(text).toMatch(/Disallow:\s*\/\s*$/m);
      expect(text).not.toMatch(/Sitemap:/i);
      const home = await waitForRequestOk(request, '/');
      expect(home.headers()['x-robots-tag'] ?? '').toMatch(/noindex/i);
    } else {
      expect(text).toMatch(/Disallow:\s*\/studio/i);
      expect(text).toMatch(/Sitemap:/i);
    }
  });

  test('sitemap excludes studio and includes public paths', async ({ request }) => {
    const index = await waitForRequestOk(request, '/sitemap-index.xml');
    const indexXml = await index.text();
    expect(indexXml).not.toMatch(/\/studio/i);

    const locMatches = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(locMatches.length).toBeGreaterThan(0);

    let combined = indexXml;
    for (const loc of locMatches) {
      if (!/sitemap/i.test(loc)) continue;
      const childPath = new URL(loc).pathname;
      const child = await waitForRequestOk(request, childPath);
      combined += await child.text();
    }

    expect(combined).not.toMatch(/\/studio/i);
    expect(combined).toMatch(/\/materials\/?/);
    expect(combined).toMatch(new RegExp(`/for/${castingSlug}`));
  });
});
