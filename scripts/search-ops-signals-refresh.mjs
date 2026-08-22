#!/usr/bin/env node
/**
 * SEARCH-P4-002 — Monthly GSC + GA search signal artifact (no Gemini).
 *
 * Pulls stats since the last successful artifact (else last N days): top query
 * themes, /for/* CTR/impression bands, indexing anomaly summary, GA organic
 * landings + conversion events by landing.
 * Writes docs/ops/search-signals/{from}_{to}.{json,md} plus latest.{json,md}.
 *
 * Env:
 *   GSC_SITE_URL (+ GSC_DATA_API_SA_JSON_FILE, else GA_DATA_API_SA_JSON_FILE)
 *   GA_PROPERTY_ID + GA_DATA_API_SA_JSON_FILE (organic landings / events)
 *
 * Flags:
 *   --from=YYYY-MM-DD     explicit window start (inclusive)
 *   --to=YYYY-MM-DD       explicit window end (inclusive; default: yesterday UTC)
 *   --lookback-days=N     first-run / fallback window length (default: 28)
 *   --out-dir=path        default: docs/ops/search-signals
 *   --fixture=path.json   skip live APIs; build from fixture payload
 *   --strict              exit 1 if GSC and GA both unavailable
 *
 * Console logs: counts/themes only — never full query tables.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { auth, searchconsole } from "@googleapis/searchconsole";
import { withPageLabel } from "./lib/page-labels.mjs";
import {
  classifyQuery,
  ctrBand,
  ctrPct,
  impressionBand,
  isCastingLanderPath,
  isStudioPath,
  pathFromGscPage,
} from "./lib/search-signal-themes.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = join(ROOT, "docs/ops/search-signals");
const DEFAULT_GSC_SITE_URL = "https://elysetindall.com/";
const TOP_QUERIES = 20;
const TOP_PAGES = 25;
const TOP_LANDINGS = 20;
const DEFAULT_LOOKBACK_DAYS = 28;
const MAX_LOOKBACK_DAYS = 45;
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const PRIVACY_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\+1[\s-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/,
  /BEGIN ([A-Z]+ )?PRIVATE KEY/,
];

/** Known legacy / redirect sources that should not keep organic impressions. */
const LEGACY_PATH_PREFIXES = [
  "/looking-for",
  "/about-me",
  "/showreel",
  "/filmography",
  "/privacy-policy",
  "/elyse-tindall-shines",
  "/elyse-tindall-has-just",
  "/lessons/acting-lessons",
  "/lessons/audition-preparation",
  "/lessons/voice-and-vocal-lessons",
];

function parseArgs(argv) {
  /** @type {{ from: string | null, to: string | null, lookbackDays: number, outDir: string, fixture: string | null, strict: boolean }} */
  const out = {
    from: null,
    to: null,
    lookbackDays: DEFAULT_LOOKBACK_DAYS,
    outDir: DEFAULT_OUT,
    fixture: null,
    strict: false,
  };
  for (const a of argv) {
    if (a.startsWith("--from=")) out.from = a.slice("--from=".length);
    else if (a.startsWith("--to=")) out.to = a.slice("--to=".length);
    else if (a.startsWith("--lookback-days=")) {
      out.lookbackDays = Number(a.slice("--lookback-days=".length));
    } else if (a.startsWith("--out-dir=")) out.outDir = a.slice("--out-dir=".length);
    else if (a.startsWith("--fixture=")) out.fixture = a.slice("--fixture=".length);
    else if (a === "--strict") out.strict = true;
    // Legacy --anchor= was prior-month mode; treat as --to= for one day earlier window end.
    else if (a.startsWith("--anchor=")) {
      out.to = addDaysUtc(a.slice("--anchor=".length), -1);
    }
  }
  return out;
}

function todayUtcYmd() {
  return new Date().toISOString().slice(0, 10);
}

function assertYmd(value, label) {
  if (!YMD_RE.test(value)) {
    throw new Error(`Invalid ${label} (expected YYYY-MM-DD): ${value}`);
  }
}

/** @param {string} ymd @param {number} days */
function addDaysUtc(ymd, days) {
  assertYmd(ymd, "date");
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenUtc(fromYmd, toYmd) {
  const a = new Date(`${fromYmd}T00:00:00.000Z`).getTime();
  const b = new Date(`${toYmd}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Read the newest prior artifact's inclusive end date from outDir.
 * Prefers latest.json, else scans dated `{from}_{to}.json` / legacy `YYYY-MM.json`.
 * @param {string} outDir
 * @returns {string | null}
 */
function findLastWindowEnd(outDir) {
  if (!existsSync(outDir)) return null;

  const tryReadEnd = (filePath) => {
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8"));
      const end = String(raw?.window?.toInclusive || "").trim();
      if (YMD_RE.test(end)) return end;
      const gen = String(raw?.generatedAt || "").slice(0, 10);
      if (YMD_RE.test(gen)) return gen;
    } catch {
      // ignore corrupt/partial
    }
    return null;
  };

  const latestPath = join(outDir, "latest.json");
  if (existsSync(latestPath)) {
    const end = tryReadEnd(latestPath);
    if (end) return end;
  }

  /** @type {string[]} */
  const ends = [];
  for (const name of readdirSync(outDir)) {
    if (!name.endsWith(".json") || name === "latest.json") continue;
    const end = tryReadEnd(join(outDir, name));
    if (end) ends.push(end);
  }
  if (ends.length === 0) return null;
  ends.sort();
  return ends[ends.length - 1];
}

/**
 * Resolve inclusive reporting window: since last run, else lookback days.
 * @param {{ outDir: string, from: string | null, to: string | null, lookbackDays: number }} opts
 */
function resolveWindow(opts) {
  const lookbackDays = Number.isFinite(opts.lookbackDays) && opts.lookbackDays > 0
    ? Math.min(Math.floor(opts.lookbackDays), MAX_LOOKBACK_DAYS)
    : DEFAULT_LOOKBACK_DAYS;

  const toInclusive = opts.to || addDaysUtc(todayUtcYmd(), -1);
  assertYmd(toInclusive, "--to");

  /** @type {"explicit" | "since_last_run" | "lookback"} */
  let source = "lookback";
  let from = opts.from;

  if (from) {
    assertYmd(from, "--from");
    source = "explicit";
  } else {
    const lastEnd = findLastWindowEnd(opts.outDir);
    if (lastEnd) {
      from = addDaysUtc(lastEnd, 1);
      source = "since_last_run";
    } else {
      from = addDaysUtc(toInclusive, -(lookbackDays - 1));
      source = "lookback";
    }
  }

  // Empty / inverted window (e.g. re-run same day) → fall back to lookback ending at toInclusive.
  if (from > toInclusive) {
    from = addDaysUtc(toInclusive, -(lookbackDays - 1));
    source = "lookback";
  }

  // Cap very long gaps (missed schedules) so one run does not pull a huge range.
  if (daysBetweenUtc(from, toInclusive) + 1 > MAX_LOOKBACK_DAYS) {
    from = addDaysUtc(toInclusive, -(MAX_LOOKBACK_DAYS - 1));
    source = "lookback";
  }

  const toExclusive = addDaysUtc(toInclusive, 1);
  const label = `${from}_${toInclusive}`;
  return { from, toInclusive, toExclusive, label, source, lookbackDays };
}

function redact(msg) {
  return String(msg).replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    "<redacted>",
  );
}

function assertPrivacySafe(text, label) {
  for (const re of PRIVACY_PATTERNS) {
    if (re.test(text)) {
      throw new Error(
        `Refusing to write ${label}: matched privacy pattern. Remove private contacts/secrets.`,
      );
    }
  }
}

function resolveSaKeyFile() {
  const gsc = String(process.env.GSC_DATA_API_SA_JSON_FILE || "").trim();
  if (gsc && existsSync(gsc)) return gsc;
  const ga = String(process.env.GA_DATA_API_SA_JSON_FILE || "").trim();
  if (ga && existsSync(ga)) return ga;
  return "";
}

function listCastingLanderPaths() {
  const dir = join(ROOT, "src/content/casting");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => `/for/${f.replace(/\.md$/, "")}`)
    .sort();
}

/**
 * @param {import('@googleapis/searchconsole').searchconsole_v1.Searchconsole} client
 * @param {string} siteUrl
 * @param {string} startDate
 * @param {string} endDate
 * @param {string[]} dimensions
 * @param {number} rowLimit
 */
async function gscQuery(client, siteUrl, startDate, endDate, dimensions, rowLimit) {
  const res = await client.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions,
      rowLimit,
      dataState: "all",
    },
  });
  return res.data?.rows || [];
}

/**
 * @param {object} opts
 * @param {string} opts.siteUrl
 * @param {string} opts.keyFile
 * @param {string} opts.startDate
 * @param {string} opts.endDate
 */
async function probeGsc({ siteUrl, keyFile, startDate, endDate }) {
  const googleAuth = new auth.GoogleAuth({
    keyFile,
    scopes: [GSC_SCOPE],
  });
  const client = searchconsole({
    version: "v1",
    auth: googleAuth,
  });

  const queryRows = await gscQuery(client, siteUrl, startDate, endDate, ["query"], TOP_QUERIES);
  const pageRows = await gscQuery(client, siteUrl, startDate, endDate, ["page"], TOP_PAGES);

  /** @type {Record<string, { impressions: number, clicks: number, brand: number, nonBrand: number }>} */
  const themeRollup = {};
  /** @type {object[]} */
  const topQueries = [];
  let brandImpressions = 0;
  let nonBrandImpressions = 0;
  let brandClicks = 0;
  let nonBrandClicks = 0;

  for (const row of queryRows) {
    const query = String(row.keys?.[0] || "").trim();
    if (!query) continue;
    const clicks = Number(row.clicks) || 0;
    const impressions = Number(row.impressions) || 0;
    const ctr = Number(row.ctr) || 0;
    const position = Number(row.position) || 0;
    const { brand, themes } = classifyQuery(query);
    if (brand) {
      brandImpressions += impressions;
      brandClicks += clicks;
    } else {
      nonBrandImpressions += impressions;
      nonBrandClicks += clicks;
    }
    for (const theme of themes) {
      if (!themeRollup[theme]) {
        themeRollup[theme] = { impressions: 0, clicks: 0, brand: 0, nonBrand: 0 };
      }
      themeRollup[theme].impressions += impressions;
      themeRollup[theme].clicks += clicks;
      if (brand) themeRollup[theme].brand += impressions;
      else themeRollup[theme].nonBrand += impressions;
    }
    // Artifact keeps a short query snippet (public search terms) + bands — not a full export.
    topQueries.push({
      themePrimary: themes[0] || "other",
      brand,
      // Truncate long queries; keep readable for operators / DISC handoff.
      query: query.length > 80 ? `${query.slice(0, 77)}…` : query,
      clicks,
      impressions,
      impressionBand: impressionBand(impressions),
      ctrPct: ctrPct(ctr),
      ctrBand: ctrBand(ctr),
      position: Math.round(position * 10) / 10,
    });
  }

  /** @type {object[]} */
  const pages = [];
  /** @type {object[]} */
  const castingPages = [];
  /** @type {string[]} */
  const studioHits = [];
  /** @type {string[]} */
  const legacyHits = [];

  for (const row of pageRows) {
    const pageUrl = String(row.keys?.[0] || "").trim();
    const path = pathFromGscPage(pageUrl);
    const clicks = Number(row.clicks) || 0;
    const impressions = Number(row.impressions) || 0;
    const ctr = Number(row.ctr) || 0;
    const position = Number(row.position) || 0;
    const entry = withPageLabel({
      path,
      clicks,
      impressions,
      impressionBand: impressionBand(impressions),
      ctrPct: ctrPct(ctr),
      ctrBand: ctrBand(ctr),
      position: Math.round(position * 10) / 10,
    });
    pages.push(entry);
    if (isCastingLanderPath(path) || path === "/lessons") {
      castingPages.push(entry);
    }
    if (isStudioPath(path)) studioHits.push(path);
    if (LEGACY_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      legacyHits.push(path);
    }
  }

  let sitemapCount = 0;
  let sitemapErrors = 0;
  try {
    const sm = await client.sitemaps.list({ siteUrl });
    const list = sm.data?.sitemap || [];
    sitemapCount = list.length;
    for (const s of list) {
      const errs = Number(s.errors) || 0;
      if (errs > 0) sitemapErrors += errs;
    }
  } catch {
    // Sitemap list is best-effort for the anomaly summary.
  }

  const themes = Object.entries(themeRollup)
    .map(([id, v]) => ({
      id,
      impressions: v.impressions,
      clicks: v.clicks,
      impressionBand: impressionBand(v.impressions),
      brandShare:
        v.impressions > 0 ? Math.round((v.brand / v.impressions) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions);

  return {
    ok: true,
    queryCount: queryRows.length,
    pageCount: pageRows.length,
    brandVsNonBrand: {
      brand: {
        impressions: brandImpressions,
        clicks: brandClicks,
        impressionBand: impressionBand(brandImpressions),
      },
      nonBrand: {
        impressions: nonBrandImpressions,
        clicks: nonBrandClicks,
        impressionBand: impressionBand(nonBrandImpressions),
      },
    },
    themes,
    topQueries,
    pages,
    focusPages: castingPages,
    indexing: {
      studioPathsWithImpressions: [...new Set(studioHits)].sort(),
      legacyPathsWithImpressions: [...new Set(legacyHits)].sort(),
      sitemapCount,
      sitemapErrors,
      note:
        studioHits.length || legacyHits.length
          ? "Unexpected indexed paths with impressions — check 301/noIndex/sitemap."
          : "No /studio or known legacy paths with impressions in top pages.",
    },
    note: `GSC ${queryRows.length} query row(s), ${pageRows.length} page row(s); ${themes.length} theme(s).`,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.propertyId
 * @param {string} opts.keyFile
 * @param {string} opts.startDate
 * @param {string} opts.endDate
 */
async function probeGaOrganic({ propertyId, keyFile, startDate, endDate }) {
  const client = new BetaAnalyticsDataClient({ keyFilename: keyFile });
  const property = `properties/${propertyId}`;
  const dateRanges = [{ startDate, endDate }];

  const organicFilter = {
    filter: {
      fieldName: "sessionDefaultChannelGroup",
      stringFilter: { matchType: "EXACT", value: "Organic Search" },
    },
  };

  const [landingsRes] = await client.runReport({
    property,
    dateRanges,
    dimensions: [{ name: "landingPagePlusQueryString" }],
    metrics: [{ name: "sessions" }, { name: "engagementRate" }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          organicFilter,
          {
            notExpression: {
              filter: {
                fieldName: "landingPagePlusQueryString",
                stringFilter: { matchType: "BEGINS_WITH", value: "/studio" },
              },
            },
          },
        ],
      },
    },
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: TOP_LANDINGS + 5,
  });

  /** @type {object[]} */
  const landings = [];
  for (const row of landingsRes?.rows || []) {
    const raw = String(row.dimensionValues?.[0]?.value || "").trim() || "/";
    const path = pathFromGscPage(raw);
    if (isStudioPath(path)) continue;
    const sessions = Number(row.metricValues?.[0]?.value ?? 0);
    const engagementRate = Number(row.metricValues?.[1]?.value ?? 0);
    landings.push(
      withPageLabel({
        path,
        sessions,
        engagementRatePct: Math.round(engagementRate * 1000) / 10,
      }),
    );
    if (landings.length >= TOP_LANDINGS) break;
  }

  const eventNames = ["generate_lead", "file_download", "select_content"];
  /** @type {Record<string, Record<string, number>>} */
  const eventsByLanding = {};

  for (const eventName of eventNames) {
    const [evRes] = await client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: "landingPagePlusQueryString" }, { name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            organicFilter,
            {
              filter: {
                fieldName: "eventName",
                stringFilter: { matchType: "EXACT", value: eventName },
              },
            },
          ],
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 15,
    });
    for (const row of evRes?.rows || []) {
      const path = pathFromGscPage(String(row.dimensionValues?.[0]?.value || ""));
      if (isStudioPath(path)) continue;
      const count = Number(row.metricValues?.[0]?.value ?? 0);
      if (!eventsByLanding[path]) eventsByLanding[path] = {};
      eventsByLanding[path][eventName] =
        (eventsByLanding[path][eventName] || 0) + count;
    }
  }

  /** @type {object[]} */
  const conversionsByLanding = Object.entries(eventsByLanding)
    .map(([path, events]) =>
      withPageLabel({
        path,
        events: { ...events },
        total:
          (events.generate_lead || 0) +
          (events.file_download || 0) +
          (events.select_content || 0),
      }),
    )
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_LANDINGS);

  return {
    ok: true,
    landings,
    conversionsByLanding,
    landingCount: landings.length,
    conversionLandingCount: conversionsByLanding.length,
    note: `GA organic ${landings.length} landing(s); ${conversionsByLanding.length} conversion landing(s).`,
  };
}

/**
 * Join GSC page metrics with GA organic landings / conversions (checklist row 5).
 * @param {object | null} gsc
 * @param {object | null} ga
 */
function buildGaGscJoin(gsc, ga) {
  if (!gsc?.ok && !ga?.ok) {
    return { ok: false, rows: [], note: "Both GSC and GA unavailable for join." };
  }
  /** @type {Map<string, object>} */
  const byPath = new Map();

  for (const p of gsc?.pages || []) {
    byPath.set(p.path, {
      path: p.path,
      label: p.label,
      gscImpressions: p.impressions ?? 0,
      gscClicks: p.clicks ?? 0,
      gscCtrBand: p.ctrBand ?? "unknown",
      gaSessions: 0,
      events: {},
    });
  }
  for (const l of ga?.landings || []) {
    const cur = byPath.get(l.path) || {
      path: l.path,
      label: l.label,
      gscImpressions: 0,
      gscClicks: 0,
      gscCtrBand: "unknown",
      gaSessions: 0,
      events: {},
    };
    cur.gaSessions = l.sessions ?? 0;
    if (!cur.label && l.label) cur.label = l.label;
    byPath.set(l.path, cur);
  }
  for (const c of ga?.conversionsByLanding || []) {
    const cur = byPath.get(c.path) || {
      path: c.path,
      label: c.label,
      gscImpressions: 0,
      gscClicks: 0,
      gscCtrBand: "unknown",
      gaSessions: 0,
      events: {},
    };
    cur.events = { ...(c.events || {}) };
    if (!cur.label && c.label) cur.label = c.label;
    byPath.set(c.path, cur);
  }

  const rows = [...byPath.values()]
    .filter((r) => r.gscImpressions > 0 || r.gaSessions > 0)
    .sort(
      (a, b) =>
        b.gscImpressions + b.gaSessions * 10 - (a.gscImpressions + a.gaSessions * 10),
    )
    .slice(0, TOP_PAGES)
    .map((r) => withPageLabel(r));

  return {
    ok: true,
    rows,
    note: `Joined ${rows.length} path(s) across GSC pages and GA organic landings.`,
  };
}

function renderMarkdown(artifact) {
  const lines = [
    `# Search signals — ${artifact.period}`,
    "",
    `Generated: ${artifact.generatedAt}`,
    `Window: ${artifact.window.from} → ${artifact.window.toInclusive} (UTC)` +
      (artifact.window.source ? ` · source=${artifact.window.source}` : ""),
    `Action: \`SEARCH-P4-002\` · **No Gemini**`,
    "",
    "## Coverage",
    "",
    `| Checklist row | Status | Note |`,
    `|---|---|---|`,
  ];
  for (const row of artifact.coverage || []) {
    lines.push(`| ${row.id} ${row.title} | ${row.status} | ${row.note || ""} |`);
  }
  lines.push("", "## GSC themes", "");
  if (artifact.gsc?.ok) {
    const b = artifact.gsc.brandVsNonBrand;
    lines.push(
      `- Brand impressions band: **${b.brand.impressionBand}** (${b.brand.impressions})`,
      `- Non-brand impressions band: **${b.nonBrand.impressionBand}** (${b.nonBrand.impressions})`,
      "",
      "| Theme | Impressions band | Clicks |",
      "|---|---|---|",
    );
    for (const t of artifact.gsc.themes || []) {
      lines.push(`| ${t.id} | ${t.impressionBand} | ${t.clicks} |`);
    }
    lines.push("", "### Focus pages (`/for/*`, `/lessons`)", "");
    if ((artifact.gsc.focusPages || []).length === 0) {
      lines.push("_None in top pages for this window._");
    } else {
      lines.push("| Path | Impressions band | CTR band |", "|---|---|---|");
      for (const p of artifact.gsc.focusPages) {
        lines.push(
          `| ${p.path} | ${p.impressionBand} | ${p.ctrBand} |`,
        );
      }
    }
    lines.push("", "### Indexing anomalies", "");
    const ix = artifact.gsc.indexing || {};
    lines.push(
      `- Studio paths with impressions: ${(ix.studioPathsWithImpressions || []).join(", ") || "(none)"}`,
      `- Legacy paths with impressions: ${(ix.legacyPathsWithImpressions || []).join(", ") || "(none)"}`,
      `- Sitemaps listed: ${ix.sitemapCount ?? "—"} (errors: ${ix.sitemapErrors ?? "—"})`,
      `- ${ix.note || ""}`,
    );
  } else {
    lines.push(`_Unavailable:_ ${artifact.gsc?.note || "GSC not loaded"}`);
  }

  lines.push("", "## GA organic landings", "");
  if (artifact.ga?.ok) {
    lines.push("| Path | Sessions | Engagement % |", "|---|---|---|");
    for (const l of artifact.ga.landings || []) {
      lines.push(`| ${l.path} | ${l.sessions} | ${l.engagementRatePct} |`);
    }
    lines.push("", "### Conversion events by organic landing", "");
    if ((artifact.ga.conversionsByLanding || []).length === 0) {
      lines.push("_No generate_lead / file_download / select_content on organic landings._");
    } else {
      lines.push("| Path | generate_lead | file_download | select_content |", "|---|---|---|---|");
      for (const c of artifact.ga.conversionsByLanding) {
        const e = c.events || {};
        lines.push(
          `| ${c.path} | ${e.generate_lead || 0} | ${e.file_download || 0} | ${e.select_content || 0} |`,
        );
      }
    }
  } else {
    lines.push(`_Unavailable:_ ${artifact.ga?.note || "GA not loaded"}`);
  }

  lines.push("", "## GA ↔ GSC join", "");
  if (artifact.join?.ok) {
    lines.push(
      "| Path | GSC impressions | GSC CTR band | GA sessions | Events |",
      "|---|---|---|---|---|",
    );
    for (const r of artifact.join.rows || []) {
      const ev = Object.entries(r.events || {})
        .map(([k, v]) => `${k}:${v}`)
        .join(", ");
      lines.push(
        `| ${r.path} | ${r.gscImpressions} | ${r.gscCtrBand} | ${r.gaSessions} | ${ev || "—"} |`,
      );
    }
  } else {
    lines.push(`_Unavailable:_ ${artifact.join?.note || ""}`);
  }

  lines.push(
    "",
    "## Casting landers in repo",
    "",
    `Count: **${(artifact.castingLandersInRepo || []).length}**`,
    "",
    "Handoff: `DISC-P4-003` / `SEARCH-P4-004` consume this artifact (themes/paths only).",
    "",
    "Rows 6–7 (CWV / Enhancements) stay manual per [search-ops-monthly.md](../../runbooks/search-ops-monthly.md).",
    "",
  );
  return `${lines.join("\n")}\n`;
}

function buildCoverage(gsc, ga, join) {
  return [
    {
      id: 1,
      title: "GSC Performance",
      status: gsc?.ok ? "ok" : "stale",
      note: gsc?.note || "GSC unavailable",
    },
    {
      id: 2,
      title: "GSC Pages / indexing anomalies",
      status: gsc?.ok ? "ok" : "stale",
      note: gsc?.indexing?.note || gsc?.note || "GSC unavailable",
    },
    {
      id: 3,
      title: "GA organic landings",
      status: ga?.ok ? "ok" : "stale",
      note: ga?.note || "GA unavailable",
    },
    {
      id: 4,
      title: "GA events by landing",
      status: ga?.ok ? "ok" : "stale",
      note: ga?.ok
        ? `${ga.conversionLandingCount} conversion landing(s)`
        : ga?.note || "GA unavailable",
    },
    {
      id: 5,
      title: "GA ↔ GSC join",
      status: join?.ok ? "ok" : "stale",
      note: join?.note || "",
    },
  ];
}

/**
 * @param {object} fixture
 */
function artifactFromFixture(fixture) {
  const gsc = fixture.gsc
    ? { ...fixture.gsc, ok: fixture.gsc.ok !== false }
    : { ok: false, note: "Fixture omitted GSC." };
  const ga = fixture.ga
    ? { ...fixture.ga, ok: fixture.ga.ok !== false }
    : { ok: false, note: "Fixture omitted GA." };
  const gaGscJoin =
    fixture.join || buildGaGscJoin(gsc.ok ? gsc : null, ga.ok ? ga : null);
  return { gsc, ga, join: gaGscJoin };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.outDir.startsWith("/")
    ? args.outDir
    : join(ROOT, args.outDir);
  const window = resolveWindow({
    outDir,
    from: args.from,
    to: args.to,
    lookbackDays: args.lookbackDays,
  });
  const { from: startDate, toInclusive: endDate, label, source } = window;

  console.log(
    `SEARCH-P4-002 refresh for ${label} (${startDate}…${endDate}; ${source}); zero Gemini calls.`,
  );

  /** @type {object | null} */
  let gsc = null;
  /** @type {object | null} */
  let ga = null;

  if (args.fixture) {
    const fixturePath = args.fixture.startsWith("/")
      ? args.fixture
      : join(ROOT, args.fixture);
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    const built = artifactFromFixture(fixture);
    gsc = built.gsc;
    ga = built.ga;
    const themeIds = (gsc.themes || []).map((t) => t.id).join(",");
    console.log(
      `Fixture mode: GSC=${gsc.ok ? "ok" : "stale"}, GA=${ga.ok ? "ok" : "stale"}, themes=[${themeIds}].`,
    );
  } else {
    const siteUrlRaw = String(process.env.GSC_SITE_URL || "").trim();
    const siteUrl =
      !siteUrlRaw || siteUrlRaw === "REPLACE_ME"
        ? DEFAULT_GSC_SITE_URL
        : siteUrlRaw;
    if (!siteUrlRaw || siteUrlRaw === "REPLACE_ME") {
      console.log(
        "GSC_SITE_URL unset/REPLACE_ME — using default URL-prefix property.",
      );
    }
    const keyFile = resolveSaKeyFile();
    const propertyId = String(process.env.GA_PROPERTY_ID || "").trim();
    const gaKey =
      String(process.env.GA_DATA_API_SA_JSON_FILE || "").trim() || keyFile;

    if (siteUrl && keyFile) {
      try {
        gsc = await probeGsc({
          siteUrl,
          keyFile,
          startDate,
          endDate,
        });
        console.log(
          `GSC ok: ${gsc.queryCount} queries, ${gsc.pageCount} pages, themes=[${(gsc.themes || []).map((t) => t.id).join(",")}]`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        gsc = {
          ok: false,
          note: `GSC probe failed. (${redact(msg).slice(0, 200)})`,
        };
        console.log(`GSC stale: ${gsc.note}`);
      }
    } else {
      gsc = {
        ok: false,
        note: "GSC credentials not loaded (GSC-SITE-URL / GSC-DATA-API-SA-JSON or GA SA fallback).",
      };
      console.log(`GSC stale: ${gsc.note}`);
    }

    if (propertyId && propertyId !== "REPLACE_ME" && gaKey && existsSync(gaKey)) {
      try {
        ga = await probeGaOrganic({
          propertyId,
          keyFile: gaKey,
          startDate,
          endDate,
        });
        console.log(
          `GA ok: ${ga.landingCount} organic landing(s), ${ga.conversionLandingCount} conversion landing(s).`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ga = {
          ok: false,
          note: `GA organic probe failed. (${redact(msg).slice(0, 200)})`,
        };
        console.log(`GA stale: ${ga.note}`);
      }
    } else {
      ga = {
        ok: false,
        note: "GA Data API credentials not loaded (GA-PROPERTY-ID / GA-DATA-API-SA-JSON).",
      };
      console.log(`GA stale: ${ga.note}`);
    }
  }

  const gaGscJoin = buildGaGscJoin(gsc?.ok ? gsc : null, ga?.ok ? ga : null);
  const coverage = buildCoverage(gsc, ga, gaGscJoin);
  const castingLandersInRepo = listCastingLanderPaths();

  const artifact = {
    $schemaComment:
      "SEARCH-P4-002 search signals since last run. Paths, query themes, numeric bands only. No emails/phones/secrets. No Gemini.",
    actionId: "SEARCH-P4-002",
    period: label,
    generatedAt: new Date().toISOString(),
    window: {
      from: startDate,
      toExclusive: window.toExclusive,
      toInclusive: endDate,
      source,
    },
    castingLandersInRepo,
    coverage,
    gsc,
    ga,
    join: gaGscJoin,
  };

  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `${label}.json`);
  const mdPath = join(outDir, `${label}.md`);
  const latestJsonPath = join(outDir, "latest.json");
  const latestMdPath = join(outDir, "latest.md");
  const jsonText = `${JSON.stringify(artifact, null, 2)}\n`;
  const mdText = renderMarkdown(artifact);
  assertPrivacySafe(jsonText, jsonPath);
  assertPrivacySafe(mdText, mdPath);
  writeFileSync(jsonPath, jsonText, "utf8");
  writeFileSync(mdPath, mdText, "utf8");
  writeFileSync(latestJsonPath, jsonText, "utf8");
  writeFileSync(latestMdPath, mdText, "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${latestJsonPath}`);
  console.log(
    `Coverage: ${coverage.map((c) => `${c.id}=${c.status}`).join(" ")}`,
  );

  if (args.strict && !gsc?.ok && !ga?.ok) {
    console.error("Strict mode: both GSC and GA unavailable.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(redact(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
