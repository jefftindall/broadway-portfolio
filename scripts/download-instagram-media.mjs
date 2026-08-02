/**
 * Download recent media from an Instagram profile using your logged-in browser.
 *
 * This is a local helper for portfolio asset import. Instagram may change markup
 * or block automation; use for accounts you manage, not bulk scraping.
 *
 * ## Option A — attach to Chrome you already use (recommended)
 *
 * 1. Fully quit Chrome (all windows).
 * 2. Start Chrome with remote debugging (adjust path if needed):
 *
 *    Windows (PowerShell):
 *      & "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" `
 *        --remote-debugging-port=9222 `
 *        --user-data-dir="$env:TEMP\chrome-ig-debug"
 *
 *    First run: log into Instagram in that window (use your normal account).
 *    Later runs: you can reuse the same --user-data-dir so you stay logged in.
 *
 * 3. In another terminal (repo root):
 *      npm i -D playwright
 *      npx playwright install chromium
 *      npm run ig:download
 *
 * ## Option B — Playwright opens its own browser
 *
 *      $env:IG_LAUNCH = "1"
 *      npm run ig:download
 *
 *    Log in when the browser opens, then return to the terminal and press Enter.
 *
 * Env vars (optional):
 *   IG_USERNAME     profile to scrape (default: elyse.tindall)
 *   IG_OUT_DIR      output folder (default: public/images/gallery/instagram)
 *   IG_LIMIT        max posts (default: 24)
 *   IG_CDP          CDP URL (default: http://127.0.0.1:9222)
 *   IG_LAUNCH       set to "1" to launch Playwright Chromium instead of CDP
 */

import { chromium } from 'playwright';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const USERNAME = (process.env.IG_USERNAME || 'elyse.tindall').replace(/^@/, '');
const OUT_DIR = process.env.IG_OUT_DIR || path.join('public', 'images', 'gallery', 'instagram');
const LIMIT = Math.max(1, Number(process.env.IG_LIMIT || 24));
const CDP = process.env.IG_CDP || 'http://127.0.0.1:9222';
const LAUNCH = process.env.IG_LAUNCH === '1';
const PROFILE_URL = `https://www.instagram.com/${USERNAME}/`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ask(prompt) {
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question(prompt);
  } finally {
    rl.close();
  }
}

async function downloadFile(url, dest) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Referer: 'https://www.instagram.com/',
    },
  });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} for ${url.slice(0, 80)}…`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function extFromUrl(url, fallback) {
  try {
    const u = new URL(url);
    const base = path.basename(u.pathname);
    const m = base.match(/\.(jpe?g|png|webp|mp4|mov)(?:$|\?)/i);
    if (m) return `.${m[1].toLowerCase().replace('jpeg', 'jpg')}`;
  } catch {
    /* ignore */
  }
  return fallback;
}

async function collectPostLinks(page) {
  const links = new Set();
  for (let i = 0; i < 14 && links.size < LIMIT; i++) {
    const hrefs = await page.$$eval('a[href*="/p/"], a[href*="/reel/"]', (as) =>
      as.map((a) => a.href).filter((h) => /\/(p|reel)\//.test(h)),
    );
    for (const h of hrefs) links.add(h.split('?')[0]);
    await page.mouse.wheel(0, 2200);
    await sleep(900);
  }
  return [...links].slice(0, LIMIT);
}

async function mediaFromPost(page, postUrl) {
  await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);

  const media = await page.evaluate(() => {
    const urls = [];
    for (const v of document.querySelectorAll('article video, main video')) {
      const src = v.currentSrc || v.src;
      if (src) urls.push({ type: 'video', url: src });
      const poster = v.getAttribute('poster');
      if (poster) urls.push({ type: 'image', url: poster });
    }
    for (const img of document.querySelectorAll('article img, main img')) {
      const src = img.currentSrc || img.src;
      if (!src || src.includes('null.jpg')) continue;
      if (img.alt === 'Instagram' || /profile|avatar|story/i.test(img.alt || '')) continue;
      // Prefer larger candidates from srcset when present
      let best = src;
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        const parts = srcset.split(',').map((p) => p.trim().split(/\s+/));
        let maxW = 0;
        for (const [u, w] of parts) {
          const n = parseInt(String(w).replace('w', ''), 10) || 0;
          if (n >= maxW && u) {
            maxW = n;
            best = u;
          }
        }
      }
      urls.push({ type: 'image', url: best });
    }
    // de-dupe
    const seen = new Set();
    return urls.filter((m) => {
      if (!m.url || seen.has(m.url)) return false;
      seen.add(m.url);
      return true;
    });
  });

  return media;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let browser;
  let context;
  let page;

  if (LAUNCH) {
    console.log('Launching Chromium… log into Instagram if prompted.');
    browser = await chromium.launch({ headless: false, channel: 'chrome' }).catch(() =>
      chromium.launch({ headless: false }),
    );
    context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
    page = await context.newPage();
    await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded' });
    await ask(
      '\nIn the browser: log in if needed, open the profile grid, then press Enter here… ',
    );
  } else {
    console.log(`Connecting to Chrome CDP at ${CDP} …`);
    try {
      browser = await chromium.connectOverCDP(CDP);
    } catch (err) {
      console.error(`\nCould not connect to ${CDP}.`);
      console.error('Start Chrome with --remote-debugging-port=9222 (see script header),');
      console.error('or set IG_LAUNCH=1 to open a Playwright window instead.\n');
      throw err;
    }
    context = browser.contexts()[0] || (await browser.newContext());
    page = context.pages().find((p) => p.url().includes('instagram.com')) || (await context.newPage());
    await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2000);
    const loggedOut = await page.locator('text=Log in').first().isVisible().catch(() => false);
    if (loggedOut) {
      await ask(
        '\nThis Chrome profile is not logged into Instagram.\nLog in in the Chrome window, then press Enter… ',
      );
      await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded' });
    }
  }

  console.log(`Collecting up to ${LIMIT} posts from ${PROFILE_URL}`);
  const posts = await collectPostLinks(page);
  if (!posts.length) {
    console.error('No posts found. Confirm you are logged in and the profile is visible.');
    if (LAUNCH) await browser.close();
    process.exitCode = 1;
    return;
  }
  console.log(`Found ${posts.length} post URLs.`);

  const manifest = [];
  let fileIndex = 0;

  for (const postUrl of posts) {
    console.log(`\n→ ${postUrl}`);
    let items = [];
    try {
      items = await mediaFromPost(page, postUrl);
    } catch (err) {
      console.warn(`  skip: ${err.message || err}`);
      continue;
    }
    if (!items.length) {
      console.warn('  no media nodes found');
      continue;
    }

    for (const item of items) {
      fileIndex += 1;
      const ext = extFromUrl(item.url, item.type === 'video' ? '.mp4' : '.jpg');
      const name = `ig-${String(fileIndex).padStart(3, '0')}${ext}`;
      const dest = path.join(OUT_DIR, name);
      try {
        await downloadFile(item.url, dest);
        console.log(`  saved ${name} (${item.type})`);
        manifest.push({ file: name, type: item.type, postUrl, sourceUrl: item.url });
      } catch (err) {
        console.warn(`  download failed: ${err.message || err}`);
      }
      await sleep(400);
    }
    await sleep(700);
  }

  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({ username: USERNAME, downloadedAt: new Date().toISOString(), items: manifest }, null, 2));
  console.log(`\nDone. ${manifest.length} file(s) → ${OUT_DIR}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log('Next: add gallery markdown entries (or ask the agent to wire them in).');

  if (LAUNCH) await browser.close();
  else {
    // Leave the user's Chrome running
    browser.close = async () => {};
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
