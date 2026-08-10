/**
 * Map Search Console queries → coarse themes for git-safe search signals.
 * Never used for Gemini. Paths / themes / bands only — no PII.
 */

const BRAND_RE = /\b(elyse|tindall)\b/i;

/** @type {{ id: string, re: RegExp }[]} */
const THEME_RULES = [
  { id: "lessons", re: /\b(lesson|lessons|vocal\s*coach|voice\s*coach|singing\s*lesson|vocal\s*lesson|ccm|pedagogy)\b/i },
  { id: "casting", re: /\b(casting|audition|available|callback|headshot|resume|reel)\b/i },
  { id: "role_type", re: /\b(ingenue|mezzo|soprano|belt|belt(er|ing)?|triple\s*threat|comed(y|ic)|ethnically\s*ambiguous|young\s*adult|teenage)\b/i },
  { id: "show", re: /\b(anastasia|lily|miss\s*you\s*like\s*hell|cabaret|strand)\b/i },
  { id: "location", re: /\b(nyc|new\s*york|atlanta|georgia|broadway|off[\s-]?broadway)\b/i },
  { id: "actress", re: /\b(actress|actor|actress|musical\s*theatre|musical\s*theater|vocalist)\b/i },
];

/**
 * @param {string} query
 * @returns {{ brand: boolean, themes: string[] }}
 */
export function classifyQuery(query) {
  const q = String(query || "").trim();
  const brand = BRAND_RE.test(q);
  /** @type {string[]} */
  const themes = [];
  for (const rule of THEME_RULES) {
    if (rule.re.test(q)) themes.push(rule.id);
  }
  if (themes.length === 0) themes.push(brand ? "brand" : "other");
  return { brand, themes };
}

/**
 * @param {number} impressions
 * @returns {string}
 */
export function impressionBand(impressions) {
  const n = Number(impressions) || 0;
  if (n <= 0) return "none";
  if (n < 10) return "1-9";
  if (n < 50) return "10-49";
  if (n < 200) return "50-199";
  if (n < 1000) return "200-999";
  return "1000+";
}

/**
 * CTR as 0–1 fraction → band label.
 * @param {number} ctr
 * @returns {string}
 */
export function ctrBand(ctr) {
  const c = Number(ctr);
  if (!Number.isFinite(c) || c < 0) return "unknown";
  const pct = c * 100;
  if (pct < 1) return "lt1pct";
  if (pct < 2) return "1-2pct";
  if (pct < 5) return "2-5pct";
  if (pct < 10) return "5-10pct";
  return "10pct+";
}

/**
 * @param {string} urlOrPath
 * @returns {string}
 */
export function pathFromGscPage(urlOrPath) {
  const raw = String(urlOrPath || "").trim();
  if (!raw) return "/";
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      let p = u.pathname || "/";
      if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
      return p || "/";
    }
  } catch {
    // fall through
  }
  let p = raw.split("?")[0].split("#")[0] || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isStudioPath(path) {
  const p = pathFromGscPage(path);
  return p === "/studio" || p.startsWith("/studio/");
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isCastingLanderPath(path) {
  const p = pathFromGscPage(path);
  return p === "/for" || p.startsWith("/for/");
}

/**
 * Round CTR fraction to percent with one decimal for artifact numerics.
 * @param {number} ctr
 * @returns {number}
 */
export function ctrPct(ctr) {
  const c = Number(ctr);
  if (!Number.isFinite(c)) return 0;
  return Math.round(c * 1000) / 10;
}
