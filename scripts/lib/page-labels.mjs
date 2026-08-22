/**
 * Map public URL paths to Elyse-friendly page labels (not raw paths like "/").
 * Used by ops scorecard refresh + monthly digest email.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const STATIC_LABELS = {
  "/": "Homepage",
  "/materials": "Materials (resume & headshots)",
  "/shows": "Shows",
  "/news": "News",
  "/about": "About",
  "/about-me": "About",
  "/contact": "Contact",
  "/lessons": "Voice lessons",
  "/lessons/book": "Book a voice lesson",
  "/gallery": "Gallery",
  "/privacy": "Privacy",
  "/terms": "Terms",
  "/studio": "Studio",
};

/** @type {Map<string, string> | null} */
let contentLabelCache = null;

function normalizePath(path) {
  let p = String(path || "").trim().split("?")[0].split("#")[0] || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

function parseFrontmatterTitle(raw) {
  const m = String(raw).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const block = m[1];
  const title = block.match(/^title:\s*(.+)$/m)?.[1]?.trim();
  if (!title) return null;
  return title.replace(/^["']|["']$/g, "").trim();
}

function loadContentLabels() {
  const map = new Map();
  const addCollection = (dir, urlPrefix) => {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) return;
    for (const name of readdirSync(abs)) {
      if (!name.endsWith(".md")) continue;
      const slug = name.replace(/\.md$/, "");
      try {
        const raw = readFileSync(join(abs, name), "utf8");
        const title = parseFrontmatterTitle(raw);
        if (title) map.set(`${urlPrefix}/${slug}`, title);
      } catch {
        // ignore unreadable files
      }
    }
  };
  addCollection("src/content/casting", "/for");
  addCollection("src/content/news", "/news");
  addCollection("src/content/pages", "");
  // Also index news by title-slug for legacy WordPress URLs that omit /news/.
  const newsDir = join(ROOT, "src/content/news");
  if (existsSync(newsDir)) {
    for (const name of readdirSync(newsDir)) {
      if (!name.endsWith(".md")) continue;
      try {
        const raw = readFileSync(join(newsDir, name), "utf8");
        const title = parseFrontmatterTitle(raw);
        if (!title) continue;
        const slug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        if (slug) map.set(`/${slug}`, title);
      } catch {
        // ignore
      }
    }
  }
  return map;
}

function humanizeSlug(path) {
  const leaf = path.split("/").filter(Boolean).pop() || "page";
  return leaf
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * @param {string} path
 * @returns {string} Friendly label for digests / scorecard
 */
export function labelForPath(path) {
  const p = normalizePath(path);
  if (STATIC_LABELS[p]) return STATIC_LABELS[p];
  if (!contentLabelCache) contentLabelCache = loadContentLabels();
  if (contentLabelCache.has(p)) return contentLabelCache.get(p);
  // Legacy WordPress-style paths (e.g. /category/acting/, /2025/07/)
  if (p.startsWith("/category/")) {
    return `Old blog category: ${humanizeSlug(p)}`;
  }
  if (/^\/\d{4}\/\d{2}/.test(p)) {
    return `Old blog archive (${p.replace(/^\/|\/$/g, "")})`;
  }
  return humanizeSlug(p);
}

/**
 * @param {{ path: string, sessions?: number, label?: string }} page
 */
export function withPageLabel(page) {
  const path = normalizePath(page.path);
  return {
    ...page,
    path,
    label: labelForPath(path),
  };
}
