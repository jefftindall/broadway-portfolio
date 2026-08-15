#!/usr/bin/env node
/**
 * DISC-P4-007 — Broadway casting-language discovery (no Gemini).
 *
 * Loads the curated intent catalog, scores fit vs performer facts + show
 * evidence, skips near-dupes of existing /for/* landers, optionally maps
 * allowlisted public RSS headlines → evergreen intents, optionally ranks by
 * a manual Keyword Planner volume file, and writes
 * docs/ops/casting-language/{latest,YYYY-MM-DD}.{json,md}.
 *
 * Flags:
 *   --out-dir=path           default: docs/ops/casting-language
 *   --catalog=path           default: src/data/casting-intent-catalog.json
 *   --allowlist=path         default: src/data/casting-news-allowlist.json
 *   --min-fit=0.5            minimum fitScore to keep
 *   --max-winners=N          default: 5
 *   --volume=path.json       optional { "keyword": monthlyVolume }
 *   --news-fixture=path.xml  parse RSS fixture (no network)
 *   --fetch-news             fetch enabled allowlist RSS URLs
 *   --write-stubs=dir        write frontmatter-only stub .md (needs copy)
 *   --dupe-threshold=0.72
 *
 * Console: counts/themes only — never dump full news tables or secrets.
 */
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evidenceShows,
  findNearDuplicate,
  fitScore,
  isEvergreenCandidate,
  loadExistingCasting,
  loadShowTitles,
  mapNewsTitleToIntents,
  parseRssItemTitles,
  performerFitTags,
  volumeForKeyword,
} from "./lib/casting-language.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = join(ROOT, "docs/ops/casting-language");
const DEFAULT_CATALOG = join(ROOT, "src/data/casting-intent-catalog.json");
const DEFAULT_ALLOWLIST = join(ROOT, "src/data/casting-news-allowlist.json");
const SITE_SETTINGS = join(ROOT, "src/data/site-settings.json");

function parseArgs(argv) {
  /** @type {{
   *   outDir: string,
   *   catalog: string,
   *   allowlist: string,
   *   minFit: number,
   *   maxWinners: number,
   *   volume: string | null,
   *   newsFixture: string | null,
   *   fetchNews: boolean,
   *   writeStubs: string | null,
   *   dupeThreshold: number,
   * }} */
  const out = {
    outDir: DEFAULT_OUT,
    catalog: DEFAULT_CATALOG,
    allowlist: DEFAULT_ALLOWLIST,
    minFit: 0.5,
    maxWinners: 5,
    volume: null,
    newsFixture: null,
    fetchNews: false,
    writeStubs: null,
    dupeThreshold: 0.72,
  };
  for (const a of argv) {
    if (a.startsWith("--out-dir=")) out.outDir = a.slice("--out-dir=".length);
    else if (a.startsWith("--catalog=")) out.catalog = a.slice("--catalog=".length);
    else if (a.startsWith("--allowlist=")) out.allowlist = a.slice("--allowlist=".length);
    else if (a.startsWith("--min-fit=")) out.minFit = Number(a.slice("--min-fit=".length));
    else if (a.startsWith("--max-winners=")) out.maxWinners = Number(a.slice("--max-winners=".length));
    else if (a.startsWith("--volume=")) out.volume = a.slice("--volume=".length);
    else if (a.startsWith("--news-fixture=")) out.newsFixture = a.slice("--news-fixture=".length);
    else if (a === "--fetch-news") out.fetchNews = true;
    else if (a.startsWith("--write-stubs=")) out.writeStubs = a.slice("--write-stubs=".length);
    else if (a.startsWith("--dupe-threshold=")) {
      out.dupeThreshold = Number(a.slice("--dupe-threshold=".length));
    }
  }
  return out;
}

function todayUtcYmd() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {string} url
 * @param {number} [timeoutMs]
 */
async function fetchText(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "elyse-portfolio-casting-language/1.0 (+DISC-P4-007)" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {object} allowlist
 * @param {{ newsFixture: string | null, fetchNews: boolean }} opts
 */
async function loadNewsItems(allowlist, opts) {
  /** @type {{ title: string, link: string, sourceId: string }[]} */
  const items = [];
  /** @type {{ id: string, status: string, note: string }[]} */
  const coverage = [];

  if (opts.newsFixture) {
    const xml = readFileSync(opts.newsFixture, "utf8");
    for (const row of parseRssItemTitles(xml)) {
      items.push({ ...row, sourceId: "fixture" });
    }
    coverage.push({
      id: "fixture",
      status: "ok",
      note: `${items.length} item title(s) from fixture`,
    });
    return { items, coverage };
  }

  if (!opts.fetchNews) {
    coverage.push({
      id: "news",
      status: "skipped",
      note: "Pass --news-fixture=… or --fetch-news to include public RSS",
    });
    return { items, coverage };
  }

  for (const src of allowlist.sources || []) {
    if (!src.enabled) {
      coverage.push({ id: src.id, status: "skipped", note: "disabled" });
      continue;
    }
    if (src.kind !== "rss" || !src.url) {
      coverage.push({ id: src.id, status: "skipped", note: "not rss" });
      continue;
    }
    try {
      const xml = await fetchText(src.url);
      const parsed = parseRssItemTitles(xml);
      for (const row of parsed) items.push({ ...row, sourceId: src.id });
      coverage.push({
        id: src.id,
        status: "ok",
        note: `${parsed.length} title(s)`,
      });
    } catch (err) {
      coverage.push({
        id: src.id,
        status: "error",
        note: err instanceof Error ? err.message : "fetch failed",
      });
    }
  }
  return { items, coverage };
}

/**
 * @param {object} artifact
 */
function renderMarkdown(artifact) {
  const lines = [
    `# Casting language candidates — ${artifact.generatedDate}`,
    "",
    `Generated: ${artifact.generatedAt}`,
    `Action: \`${artifact.actionId}\` · **No Gemini** · GSC is feedback only`,
    "",
    "## Coverage",
    "",
    "| Source | Status | Note |",
    "|---|---|---|",
  ];
  for (const c of artifact.newsCoverage || []) {
    lines.push(`| ${c.id} | ${c.status} | ${c.note} |`);
  }
  lines.push(
    "",
    `Catalog intents: **${artifact.catalogCount}** · Existing landers: **${artifact.existingLanderCount}**`,
    `Winners: **${artifact.winners.length}** · Skipped: **${artifact.skipped.length}**`,
    "",
    "## Winners (draft-PR handoff)",
    "",
  );
  if (artifact.winners.length === 0) {
    lines.push("_None — raise catalog seeds or lower `--min-fit`._", "");
  } else {
    lines.push(
      "| Rank | Slug | Keyword | Fit | Volume | News boost | Evidence shows |",
      "|---|---|---|---|---|---|---|",
    );
    artifact.winners.forEach((w, i) => {
      lines.push(
        `| ${i + 1} | \`/for/${w.slug}\` | ${w.keyword} | ${w.fitScore.toFixed(2)} | ${w.volume ?? "—"} | ${w.newsBoost} | ${(w.relatedShows || []).join("; ") || "—"} |`,
      );
    });
    lines.push("");
  }

  lines.push("## Skipped (sample)", "");
  const sample = (artifact.skipped || []).slice(0, 12);
  if (sample.length === 0) lines.push("_None_", "");
  else {
    for (const s of sample) {
      lines.push(`- \`${s.slug || s.id}\`: ${s.reason}${s.detail ? ` (${s.detail})` : ""}`);
    }
    lines.push("");
  }

  lines.push(
    "## Handoff",
    "",
    "- Draft bodies / GitHub App PR: `DISC-P4-004` / `DISC-P4-001` (Gemini-capped, G-PR).",
    "- This artifact only ranks **evergreen** intents — no board scrapes (`DISC-P4-008` is licensed later).",
    "- Site demand feedback remains [`docs/ops/search-signals/`](../search-signals/) (`SEARCH-P4-002`).",
    "",
  );
  return `${lines.join("\n")}\n`;
}

/**
 * @param {object} winner
 * @param {string} dir
 */
function writeStub(winner, dir) {
  mkdirSync(dir, { recursive: true });
  const shows = (winner.relatedShows || []).map((s) => `  - ${s}`).join("\n");
  const skills = (winner.relatedSkills || []).map((s) => `  - ${s}`).join("\n");
  const body = `---
keyword: ${winner.keyword}
title: ${winner.title}
description: TODO — unique SEO description tied to real credits (DISC-P4-005).
relatedSkills:
${skills || "  - Musical theatre"}
relatedShows:
${shows || "  - Anastasia"}
cta: Request materials
---

<!-- needs copy: DISC-P4-001 / DISC-P4-004 Gemini body (GEMINI_MODEL_SEARCH_OPS). Do not auto-merge. -->

_Stub generated by DISC-P4-007. Replace with evergreen casting copy before merge._
`;
  const path = join(dir, `${winner.slug}.md`);
  writeFileSync(path, body, "utf8");
  return path;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = JSON.parse(readFileSync(args.catalog, "utf8"));
  const allowlist = JSON.parse(readFileSync(args.allowlist, "utf8"));
  const siteSettings = JSON.parse(readFileSync(SITE_SETTINGS, "utf8"));
  /** @type {Record<string, number>} */
  const volumeByKeyword = args.volume
    ? JSON.parse(readFileSync(args.volume, "utf8"))
    : {};

  const existing = loadExistingCasting(join(ROOT, "src/content/casting"));
  const showTitles = loadShowTitles(join(ROOT, "src/content/shows"));
  const perfTags = performerFitTags(siteSettings);
  const intents = catalog.intents || [];

  const { items: newsItems, coverage: newsCoverage } = await loadNewsItems(allowlist, args);

  /** @type {Map<string, { overlap: number, titles: string[] }>} */
  const newsBoosts = new Map();
  let newsMapped = 0;
  let newsRejected = 0;
  for (const item of newsItems) {
    const hits = mapNewsTitleToIntents(item.title, intents, allowlist);
    if (hits.length === 0) {
      newsRejected += 1;
      continue;
    }
    newsMapped += 1;
    for (const h of hits.slice(0, 3)) {
      const prev = newsBoosts.get(h.intentId) || { overlap: 0, titles: [] };
      prev.overlap += h.overlap;
      if (prev.titles.length < 3) prev.titles.push(item.title.slice(0, 120));
      newsBoosts.set(h.intentId, prev);
    }
  }

  /** @type {object[]} */
  const skipped = [];
  /** @type {object[]} */
  const scored = [];

  for (const intent of intents) {
    if (!isEvergreenCandidate(intent)) {
      skipped.push({ id: intent.id, slug: intent.slug, reason: "not_evergreen" });
      continue;
    }

    const exact = existing.find(
      (e) => e.slug === intent.slug || e.keyword.toLowerCase() === intent.keyword.toLowerCase(),
    );
    if (exact) {
      skipped.push({
        id: intent.id,
        slug: intent.slug,
        reason: "exists",
        detail: exact.slug,
      });
      continue;
    }

    const dupe = findNearDuplicate(intent.keyword, existing, args.dupeThreshold);
    if (dupe) {
      skipped.push({
        id: intent.id,
        slug: intent.slug,
        reason: "near_duplicate",
        detail: `${dupe.slug} @ ${dupe.score.toFixed(2)}`,
      });
      continue;
    }

    const fit = fitScore(intent, perfTags);
    if (fit.score < args.minFit) {
      skipped.push({
        id: intent.id,
        slug: intent.slug,
        reason: "low_fit",
        detail: fit.score.toFixed(2),
      });
      continue;
    }

    const evidence = evidenceShows(intent, showTitles);
    if (!evidence.ok) {
      skipped.push({
        id: intent.id,
        slug: intent.slug,
        reason: "no_show_evidence",
      });
      continue;
    }

    const volume = volumeForKeyword(volumeByKeyword, intent.keyword);
    const boost = newsBoosts.get(intent.id);
    const newsBoost = boost ? boost.overlap : 0;
    const priority = Number(intent.priority) || 0;
    const rankScore =
      fit.score * 100 +
      priority * 0.5 +
      newsBoost * 3 +
      (volume != null ? Math.min(volume, 500) / 50 : 0);

    scored.push({
      id: intent.id,
      slug: intent.slug,
      keyword: intent.keyword,
      title: intent.title,
      category: intent.category,
      fitScore: Number(fit.score.toFixed(3)),
      fitMatched: fit.matched,
      priority,
      volume,
      newsBoost,
      newsTitles: boost?.titles || [],
      relatedShows: evidence.matched,
      relatedSkills: intent.relatedSkills || [],
      rankScore: Number(rankScore.toFixed(2)),
      handoff: "DISC-P4-004",
    });
  }

  scored.sort((a, b) => b.rankScore - a.rankScore);
  /** @type {object[]} */
  const winners = [];
  for (const row of scored) {
    if (winners.length >= Math.max(0, args.maxWinners)) break;
    const vsWinner = findNearDuplicate(
      row.keyword,
      winners.map((w) => ({ slug: w.slug, keyword: w.keyword })),
      args.dupeThreshold,
    );
    if (vsWinner) {
      skipped.push({
        id: row.id,
        slug: row.slug,
        reason: "near_duplicate_winner",
        detail: `${vsWinner.slug} @ ${vsWinner.score.toFixed(2)}`,
      });
      continue;
    }
    winners.push(row);
  }

  const generatedDate = todayUtcYmd();
  const artifact = {
    $schemaComment:
      "DISC-P4-007 casting-language candidates. Slugs/keywords/bands only. No Gemini. No board scrapes.",
    actionId: "DISC-P4-007",
    generatedAt: new Date().toISOString(),
    generatedDate,
    catalogCount: intents.length,
    existingLanderCount: existing.length,
    minFit: args.minFit,
    newsCoverage,
    newsStats: {
      items: newsItems.length,
      mapped: newsMapped,
      rejectedOrUnmapped: newsRejected,
    },
    winners,
    skipped,
    notes: [
      "GSC search-signals are site-demand feedback after pages ship — not the Broadway keyword mine.",
      "Lander body generation remains DISC-P4-004 on GEMINI_MODEL_SEARCH_OPS (G-PR).",
      "Licensed casting-board trends are DISC-P4-008.",
    ],
  };

  mkdirSync(args.outDir, { recursive: true });
  const jsonText = `${JSON.stringify(artifact, null, 2)}\n`;
  const mdText = renderMarkdown(artifact);
  const datedJson = join(args.outDir, `${generatedDate}.json`);
  const datedMd = join(args.outDir, `${generatedDate}.md`);
  writeFileSync(datedJson, jsonText, "utf8");
  writeFileSync(datedMd, mdText, "utf8");
  writeFileSync(join(args.outDir, "latest.json"), jsonText, "utf8");
  writeFileSync(join(args.outDir, "latest.md"), mdText, "utf8");

  /** @type {string[]} */
  const stubPaths = [];
  if (args.writeStubs) {
    for (const w of winners) stubPaths.push(writeStub(w, args.writeStubs));
  }

  console.log(
    `DISC-P4-007 casting-language: catalog=${intents.length} existing=${existing.length} winners=${winners.length} skipped=${skipped.length} news_items=${newsItems.length} news_mapped=${newsMapped}`,
  );
  console.log(`Wrote ${datedJson}`);
  console.log(`Wrote ${join(args.outDir, "latest.json")}`);
  if (stubPaths.length) console.log(`Wrote ${stubPaths.length} stub(s) under ${args.writeStubs}`);
}

main().catch((err) => {
  console.error("DISC-P4-007 failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
