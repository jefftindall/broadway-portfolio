/**
 * DISC-P4-007 / shared lander guardrail helpers (feeds DISC-P4-005).
 * Zero Gemini. Themes/paths/slugs only — no PII, no board scrapes.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const STOP = new Set([
  "a",
  "an",
  "the",
  "for",
  "and",
  "or",
  "of",
  "to",
  "in",
  "with",
  "on",
]);

/** @param {string} s */
export function normalizePhrase(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** @param {string} s */
export function tokenize(s) {
  return normalizePhrase(s)
    .split(" ")
    .filter((t) => t && !STOP.has(t) && t.length > 1);
}

/**
 * Jaccard similarity on token sets (0–1).
 * @param {string} a
 * @param {string} b
 */
export function tokenJaccard(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/**
 * @param {string} slugOrKeyword
 * @param {{ slug: string, keyword: string }[]} existing
 * @param {number} [threshold]
 */
export function findNearDuplicate(slugOrKeyword, existing, threshold = 0.72) {
  const needle = normalizePhrase(slugOrKeyword);
  let best = null;
  for (const row of existing) {
    const againstSlug = tokenJaccard(needle, row.slug);
    const againstKw = tokenJaccard(needle, row.keyword);
    const score = Math.max(againstSlug, againstKw);
    if (score >= threshold && (!best || score > best.score)) {
      best = { score, slug: row.slug, keyword: row.keyword };
    }
  }
  return best;
}

/**
 * Reject ephemeral / show-title spam pages (evergreen guardrail).
 * @param {{ evergreen?: boolean, keyword?: string, title?: string }} intent
 * @param {string} [newsTitle]
 */
export function isEvergreenCandidate(intent, newsTitle = "") {
  if (intent.evergreen === false) return false;
  const blob = `${intent.keyword || ""} ${intent.title || ""} ${newsTitle}`;
  if (/\b(this week|now casting|auditions?\s+(today|tomorrow)|closes?\s+\d)/i.test(blob)) {
    return false;
  }
  return true;
}

/**
 * Build performer tag set from site-settings performer + known location/skills.
 * @param {{ performer?: Record<string, string> }} siteLike
 */
export function performerFitTags(siteLike) {
  /** @type {Set<string>} */
  const tags = new Set(["type:musical-theatre", "type:theatre", "geo:nyc", "geo:atlanta"]);
  const p = siteLike.performer || {};
  const ethnicity = String(p.ethnicity || "").toLowerCase();
  const vocalType = String(p.vocalType || "").toLowerCase();
  const vocalRange = String(p.vocalRange || "").toLowerCase();
  const playingAge = String(p.playingAge || "").toLowerCase();

  if (/latina|latin\b/.test(ethnicity)) tags.add("ethnicity:latina");
  if (/hispanic/.test(ethnicity)) tags.add("ethnicity:hispanic");
  if (/mediterranean/.test(ethnicity)) tags.add("ethnicity:mediterranean");
  if (/italian/.test(ethnicity)) tags.add("ethnicity:italian");
  if (/greek/.test(ethnicity)) tags.add("ethnicity:greek");
  if (/middle eastern/.test(ethnicity)) tags.add("ethnicity:middle-eastern");
  if (/ethnically ambiguous|ambiguous/.test(ethnicity)) tags.add("ethnicity:ambiguous");
  if (/white/.test(ethnicity)) tags.add("ethnicity:white");

  if (/mezzo/.test(vocalType)) tags.add("vocal:mezzo");
  if (/belt/.test(vocalType) || /belt/.test(vocalRange)) tags.add("vocal:belt");
  if (/soprano/.test(vocalType)) tags.add("vocal:soprano");
  if (/ccm|contemporary/.test(vocalType)) tags.add("vocal:ccm");
  // knowsAbout / lessons lane always present for Elyse
  tags.add("vocal:ccm");

  if (/15|1[6-9]|2[0-8]|teen|young/.test(playingAge)) {
    tags.add("age:teenage");
    tags.add("age:young-adult");
  }

  tags.add("archetype:comedic");
  tags.add("archetype:ingenue");
  tags.add("archetype:character");
  tags.add("type:contemporary");
  tags.add("type:off-broadway");

  return tags;
}

/**
 * @param {{ fitTags?: string[] }} intent
 * @param {Set<string>} performerTags
 */
export function fitScore(intent, performerTags) {
  const needed = intent.fitTags || [];
  if (needed.length === 0) return { score: 0, matched: [], missing: [] };
  /** @type {string[]} */
  const matched = [];
  /** @type {string[]} */
  const missing = [];
  for (const t of needed) {
    if (performerTags.has(t)) matched.push(t);
    else missing.push(t);
  }
  const score = matched.length / needed.length;
  return { score, matched, missing };
}

/**
 * Prefer intents that cite real credits.
 * @param {{ relatedShowHints?: string[] }} intent
 * @param {string[]} showTitles
 */
export function evidenceShows(intent, showTitles) {
  const hints = intent.relatedShowHints || [];
  if (hints.length === 0) return { ok: false, matched: [] };
  const normalizedShows = showTitles.map((t) => normalizePhrase(t));
  /** @type {string[]} */
  const matched = [];
  for (const h of hints) {
    const nh = normalizePhrase(h);
    const hit = showTitles.find((_t, i) => {
      const ns = normalizedShows[i];
      return ns.includes(nh) || nh.includes(ns) || tokenJaccard(nh, ns) >= 0.5;
    });
    if (hit) matched.push(hit);
  }
  return { ok: matched.length > 0, matched };
}

/**
 * @param {string} castingDir
 * @returns {{ slug: string, keyword: string, relatedShows: string[] }[]}
 */
export function loadExistingCasting(castingDir) {
  if (!existsSync(castingDir)) return [];
  return readdirSync(castingDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const slug = f.replace(/\.md$/, "");
      const raw = readFileSync(join(castingDir, f), "utf8");
      const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const body = fm ? fm[1] : "";
      const keyword =
        (body.match(/^keyword:\s*(.+)$/m) || [])[1]?.trim() || slug.replace(/-/g, " ");
      /** @type {string[]} */
      const relatedShows = [];
      const showsBlock = body.match(/^relatedShows:\r?\n((?:[ \t]*-[ \t]*.+\r?\n?)*)/m);
      if (showsBlock) {
        for (const line of showsBlock[1].split(/\r?\n/)) {
          const m = line.match(/^[ \t]*-[ \t]*(.+)$/);
          if (m) relatedShows.push(m[1].trim());
        }
      }
      return { slug, keyword, relatedShows };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * @param {string} showsDir
 * @returns {string[]}
 */
export function loadShowTitles(showsDir) {
  if (!existsSync(showsDir)) return [];
  /** @type {string[]} */
  const titles = [];
  for (const f of readdirSync(showsDir)) {
    if (!f.endsWith(".md")) continue;
    const raw = readFileSync(join(showsDir, f), "utf8");
    const title = (raw.match(/^title:\s*(.+)$/m) || [])[1]?.trim();
    if (title) titles.push(title.replace(/^["']|["']$/g, ""));
  }
  return titles;
}

/**
 * Parse minimal RSS/Atom item titles from XML text.
 * @param {string} xml
 * @returns {{ title: string, link: string }[]}
 */
export function parseRssItemTitles(xml) {
  /** @type {{ title: string, link: string }[]} */
  const items = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;
  const blocks = [...(xml.match(itemRe) || []), ...(xml.match(entryRe) || [])];
  for (const block of blocks) {
    const titleRaw =
      (block.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || [])[1] ||
      (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] ||
      "";
    const linkRaw =
      (block.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1] ||
      (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] ||
      "";
    const title = decodeXml(titleRaw).trim();
    if (!title) continue;
    items.push({ title, link: decodeXml(linkRaw).trim() });
  }
  return items;
}

/** @param {string} s */
function decodeXml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * @param {string} title
 * @param {{ rejectTitlePatterns?: string[] }} allowlist
 */
export function isRejectedNewsTitle(title, allowlist) {
  for (const pat of allowlist.rejectTitlePatterns || []) {
    try {
      // Allowlist files may use (?i) — JS RegExp needs the `i` flag instead.
      let source = String(pat);
      let flags = "";
      if (source.startsWith("(?i)")) {
        source = source.slice(4);
        flags = "i";
      }
      if (new RegExp(source, flags).test(title)) return true;
    } catch {
      // ignore bad patterns
    }
  }
  return false;
}

/**
 * Map a news headline to catalog intents by token overlap (evergreen only).
 * @param {string} title
 * @param {object[]} intents
 * @param {{ rejectTitlePatterns?: string[] }} allowlist
 */
export function mapNewsTitleToIntents(title, intents, allowlist) {
  if (isRejectedNewsTitle(title, allowlist)) return [];
  const titleTokens = new Set(tokenize(title));
  if (titleTokens.size === 0) return [];
  /** @type {{ intentId: string, overlap: number, title: string }[]} */
  const hits = [];
  for (const intent of intents) {
    if (!isEvergreenCandidate(intent, title)) continue;
    const kwTokens = tokenize(intent.keyword);
    let overlap = 0;
    for (const t of kwTokens) if (titleTokens.has(t)) overlap += 1;
    // Require at least 2 overlapping content tokens (avoid "actress" alone)
    if (overlap >= 2) {
      hits.push({ intentId: intent.id, overlap, title });
    }
  }
  return hits.sort((a, b) => b.overlap - a.overlap);
}

/**
 * Optional Keyword Planner-style ranks: { "keyword phrase": volumeNumber }
 * @param {Record<string, number>} volumeByKeyword
 * @param {string} keyword
 */
export function volumeForKeyword(volumeByKeyword, keyword) {
  if (!volumeByKeyword || typeof volumeByKeyword !== "object") return null;
  const n = normalizePhrase(keyword);
  if (volumeByKeyword[keyword] != null) return Number(volumeByKeyword[keyword]) || 0;
  for (const [k, v] of Object.entries(volumeByKeyword)) {
    if (normalizePhrase(k) === n) return Number(v) || 0;
  }
  return null;
}
