#!/usr/bin/env node
/**
 * OPS-P0-004 — Refresh the operational excellence scorecard.
 *
 * Reads docs/ops/scorecard-evaluation.json, optionally probes prod SLIs
 * (homepage + materials availability, homepage FCP p75) via Azure CLI when
 * logged in, recomputes weighted overall, and regenerates
 * docs/ops/operational-excellence-scorecard.md.
 *
 * Never writes emails, phones, or secret values into the scorecard or stdout.
 *
 * Usage:
 *   node scripts/ops-scorecard-refresh.mjs
 *   node scripts/ops-scorecard-refresh.mjs --monthly [--azure]
 *   node scripts/ops-scorecard-refresh.mjs --date 2026-09-01
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EVAL_PATH = join(ROOT, "docs/ops/scorecard-evaluation.json");
const SCORECARD_PATH = join(ROOT, "docs/ops/operational-excellence-scorecard.md");

const PROD_APPI = "appi-elyse-portfolio-prod";
const PROD_RG = "rg-elyse-portfolio-prod";
const HOMEPAGE_AVAIL_TARGET = 99.8;
const MATERIALS_AVAIL_TARGET = 99.8;
const FCP_P75_TARGET_MS = 1500;
const FCP_MIN_SAMPLES = 10;

const MATURITY = [
  { min: 4.0, label: "Strong" },
  { min: 3.0, label: "Solid" },
  { min: 2.0, label: "Thin" },
  { min: 1.0, label: "Gap" },
];

function parseArgs(argv) {
  const out = { azure: false, monthly: false, date: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--azure") out.azure = true;
    else if (a === "--monthly") out.monthly = true;
    else if (a === "--date") out.date = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/ops-scorecard-refresh.mjs [--monthly] [--azure] [--date YYYY-MM-DD]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

function todayUtc(override) {
  if (override) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(override)) {
      throw new Error(`Invalid --date (expected YYYY-MM-DD): ${override}`);
    }
    return override;
  }
  return new Date().toISOString().slice(0, 10);
}

function maturityFor(score) {
  for (const band of MATURITY) {
    if (score >= band.min) return band.label;
  }
  return "Gap";
}

function weightedOverall(dimensions) {
  let weighted = 0;
  let weightSum = 0;
  for (const d of dimensions) {
    weighted += d.score * d.weight;
    weightSum += d.weight;
  }
  return weightSum === 0 ? 0 : weighted / weightSum;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function assertNoSecrets(text, label) {
  const banned = [
    /pagerduty/i,
    /routing[_-]?key/i,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /\+\d{10,15}\b/,
  ];
  for (const re of banned) {
    if (re.test(text)) {
      throw new Error(
        `Refusing to write ${label}: matched privacy pattern ${re}. Remove private contacts.`,
      );
    }
  }
}

function redact(msg) {
  return String(msg).replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    "<redacted>",
  );
}

function runAz(args) {
  return execFileSync("az", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
}

function azureLoggedIn() {
  try {
    runAz(["account", "show", "-o", "none"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Optional read-only SLI: prod homepage availability % over the last 7 days.
 */
function probeHomepageAvailability() {
  if (!azureLoggedIn()) {
    return {
      ok: false,
      note: "Azure CLI not logged in; homepage availability SLI left stale.",
    };
  }

  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const raw = runAz([
      "monitor",
      "app-insights",
      "metrics",
      "show",
      "--app",
      PROD_APPI,
      "--resource-group",
      PROD_RG,
      "--metric",
      "availabilityResults/availabilityPercentage",
      "--aggregation",
      "avg",
      "--filter",
      "availabilityResult/name eq 'webtest-elyse-homepage-prod'",
      "--start-time",
      start.toISOString(),
      "--end-time",
      end.toISOString(),
      "--interval",
      "P1D",
      "-o",
      "json",
    ]);
    const parsed = JSON.parse(raw);
    const points =
      parsed?.value?.[0]?.timeseries?.[0]?.data?.filter(
        (p) => typeof p.avg === "number",
      ) ?? [];
    if (points.length === 0) {
      // Fallback: unfiltered aggregate (legacy single-test era / filter miss).
      return probeAvailabilityUnfiltered("Homepage", HOMEPAGE_AVAIL_TARGET, start, end);
    }
    const avg = points.reduce((sum, p) => sum + p.avg, 0) / points.length;
    const pct = round1(avg);
    const meets = pct >= HOMEPAGE_AVAIL_TARGET;
    return {
      ok: true,
      pct,
      meets,
      note: `Homepage availability avg ${pct}% over ${points.length} day(s) (target ${HOMEPAGE_AVAIL_TARGET}% / 7d).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      note: `Homepage availability query failed; SLI left stale. (${redact(msg).slice(0, 200)})`,
    };
  }
}

function probeAvailabilityUnfiltered(label, target, start, end) {
  try {
    const raw = runAz([
      "monitor",
      "app-insights",
      "metrics",
      "show",
      "--app",
      PROD_APPI,
      "--resource-group",
      PROD_RG,
      "--metric",
      "availabilityResults/availabilityPercentage",
      "--aggregation",
      "avg",
      "--start-time",
      start.toISOString(),
      "--end-time",
      end.toISOString(),
      "--interval",
      "P1D",
      "-o",
      "json",
    ]);
    const parsed = JSON.parse(raw);
    const points =
      parsed?.value?.[0]?.timeseries?.[0]?.data?.filter(
        (p) => typeof p.avg === "number",
      ) ?? [];
    if (points.length === 0) {
      return {
        ok: false,
        note: `App Insights returned no availability datapoints for the last 7 days (${label}).`,
      };
    }
    const avg = points.reduce((sum, p) => sum + p.avg, 0) / points.length;
    const pct = round1(avg);
    return {
      ok: true,
      pct,
      meets: pct >= target,
      note: `${label} availability avg ${pct}% over ${points.length} day(s) (aggregate; target ${target}% / 7d).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      note: `${label} availability query failed; SLI left stale. (${redact(msg).slice(0, 200)})`,
    };
  }
}

/**
 * Materials (resume + headshot) availability via Kusto over 7d (OPS-P2-001 / SLO-4).
 */
function probeMaterialsAvailability() {
  if (!azureLoggedIn()) {
    return {
      ok: false,
      note: "Azure CLI not logged in; materials availability SLI left stale.",
    };
  }

  const query = `
availabilityResults
| where timestamp > ago(7d)
| where name has "resume" or name has "headshot"
| summarize successRate = avg(todouble(success)) * 100, samples = count()
`.trim();

  try {
    const raw = runAz([
      "monitor",
      "app-insights",
      "query",
      "--app",
      PROD_APPI,
      "--resource-group",
      PROD_RG,
      "--analytics-query",
      query,
      "-o",
      "json",
    ]);
    const parsed = JSON.parse(raw);
    const row = parsed?.tables?.[0]?.rows?.[0];
    if (!row || row[1] === 0 || row[1] == null) {
      return {
        ok: false,
        note: "No materials web-test results in the last 7 days (OPS-P2-001 apply may be pending).",
      };
    }
    const pct = round1(Number(row[0]));
    const samples = Number(row[1]);
    if (!Number.isFinite(pct)) {
      return {
        ok: false,
        note: "Materials availability query returned a non-numeric success rate.",
      };
    }
    return {
      ok: true,
      pct,
      meets: pct >= MATERIALS_AVAIL_TARGET,
      note: `Materials availability avg ${pct}% over ${samples} probe(s) (target ${MATERIALS_AVAIL_TARGET}% / 7d).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      note: `Materials availability query failed; SLI left stale. (${redact(msg).slice(0, 200)})`,
    };
  }
}

/**
 * Homepage field FCP p75 over 7d (OPS-P2-002 / SLO-6).
 */
function probeHomepageFcp() {
  if (!azureLoggedIn()) {
    return {
      ok: false,
      note: "Azure CLI not logged in; homepage FCP SLI left stale.",
    };
  }

  const query = `
customMetrics
| where timestamp > ago(7d)
| where name == "HomepageFcpMs"
| summarize samples = count(), p75 = percentile(value, 75)
`.trim();

  try {
    const raw = runAz([
      "monitor",
      "app-insights",
      "query",
      "--app",
      PROD_APPI,
      "--resource-group",
      PROD_RG,
      "--analytics-query",
      query,
      "-o",
      "json",
    ]);
    const parsed = JSON.parse(raw);
    const row = parsed?.tables?.[0]?.rows?.[0];
    const samples = Number(row?.[0] ?? 0);
    const p75 = Number(row?.[1]);
    if (!samples || samples < FCP_MIN_SAMPLES || !Number.isFinite(p75)) {
      return {
        ok: false,
        note: samples
          ? `Homepage FCP has ${samples} sample(s) (<${FCP_MIN_SAMPLES}); left stale until field traffic accumulates.`
          : "No HomepageFcpMs samples in the last 7 days (field pipeline pending deploy traffic).",
      };
    }
    const ms = Math.round(p75);
    return {
      ok: true,
      p75: ms,
      meets: ms < FCP_P75_TARGET_MS,
      note: `Homepage FCP p75 ${ms}ms over ${samples} sample(s) (target < ${FCP_P75_TARGET_MS}ms / 7d).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      note: `Homepage FCP query failed; SLI left stale. (${redact(msg).slice(0, 200)})`,
    };
  }
}

function setSlo(evaluation, id, patch) {
  const slo = evaluation.committedSlos.find((s) => s.id === id);
  if (!slo) return;
  Object.assign(slo, patch);
}

function applyAzureSlis(evaluation, probes) {
  const { homepage, materials, fcp } = probes;
  const sloDim = evaluation.dimensions.find((d) => d.id === "slo");
  const notes = [];

  if (homepage.ok) {
    setSlo(evaluation, "SLO-1", {
      status: homepage.meets ? "met" : "missed",
      note: homepage.note,
    });
    notes.push(homepage.note);
  } else {
    setSlo(evaluation, "SLO-1", { status: "stale", note: homepage.note });
    notes.push(homepage.note);
  }

  if (materials.ok) {
    setSlo(evaluation, "SLO-4", {
      status: materials.meets ? "met" : "missed",
      note: materials.note,
    });
    notes.push(materials.note);
  } else {
    setSlo(evaluation, "SLO-4", { status: "stale", note: materials.note });
    notes.push(materials.note);
  }

  if (fcp.ok) {
    setSlo(evaluation, "SLO-6", {
      status: fcp.meets ? "met" : "missed",
      note: fcp.note,
    });
    notes.push(fcp.note);
  } else {
    setSlo(evaluation, "SLO-6", { status: "stale", note: fcp.note });
    notes.push(fcp.note);
  }

  if (sloDim) {
    const anyOk = homepage.ok || materials.ok || fcp.ok;
    sloDim.sliStatus = anyOk ? "ok" : "stale";
    sloDim.sliNote = notes.join(" ");
    if (anyOk) {
      const okNotes = [homepage, materials, fcp]
        .filter((p) => p.ok)
        .map((p) => p.note);
      sloDim.evidence = `Field/synthetic SLIs: ${okNotes.join(" ")}`;
    }
  }
}

function markSlisStaleSkipped(evaluation, reason) {
  const sloDim = evaluation.dimensions.find((d) => d.id === "slo");
  if (sloDim && sloDim.sliStatus !== "blocked") {
    sloDim.sliStatus = "stale";
    sloDim.sliNote = reason;
  }
  for (const id of ["SLO-1", "SLO-4", "SLO-6"]) {
    const slo = evaluation.committedSlos.find((s) => s.id === id);
    if (slo && slo.status !== "blocked") {
      slo.status = "stale";
      slo.note = reason;
    }
  }
}

function renderScorecard(evaluation) {
  const overall = round1(weightedOverall(evaluation.dimensions));
  const lines = [];

  lines.push("# Operational excellence scorecard");
  lines.push("");
  lines.push(
    "Living reliability posture for the Elyse Tindall portfolio. Rubric, SLOs, and backlog live in [`docs/plans/operational-excellence.md`](../plans/operational-excellence.md). **Scores, evidence, and gaps only — never alert emails, phones, or secrets.**",
  );
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|-------|-------|");
  lines.push(`| **Last reviewed** | ${evaluation.lastReviewed} |`);
  lines.push(`| **Review source** | ${evaluation.reviewSource} |`);
  lines.push(`| **Weighted overall** | **${overall.toFixed(1)} / 5** |`);
  lines.push(
    `| **Target overall** | ≥ ${evaluation.targetOverall} (after P1 alerting) |`,
  );
  lines.push(`| **Verdict** | ${evaluation.verdict} |`);
  lines.push("");
  lines.push("## Dimensions");
  lines.push("");
  lines.push(
    "| Dimension | Weight | Score | Maturity | Evidence | Primary gap | SLI |",
  );
  lines.push(
    "|-----------|--------|-------|----------|----------|-------------|-----|",
  );

  for (const d of evaluation.dimensions) {
    const sli =
      d.sliStatus === "ok"
        ? "ok"
        : d.sliStatus === "blocked"
          ? "blocked"
          : "stale";
    const sliCell = d.sliNote ? `${sli}: ${d.sliNote}` : sli;
    lines.push(
      `| ${d.name} | ${d.weight.toFixed(1)} | ${d.score.toFixed(1)} | ${maturityFor(d.score)} | ${d.evidence} | ${d.gap} | ${sliCell} |`,
    );
  }

  lines.push("");
  lines.push("## Committed SLOs (status this review)");
  lines.push("");
  lines.push("| ID | SLO | Target | Status | Note |");
  lines.push("|----|-----|--------|--------|------|");
  for (const s of evaluation.committedSlos) {
    lines.push(
      `| ${s.id} | ${s.name} | ${s.target} | ${s.status} | ${s.note} |`,
    );
  }

  lines.push("");
  lines.push("## How this file is updated");
  lines.push("");
  lines.push(
    "1. Edit [`scorecard-evaluation.json`](./scorecard-evaluation.json) (scores / evidence / gaps).",
  );
  lines.push(
    "2. Run `node scripts/ops-scorecard-refresh.mjs` (add `--monthly --azure` when Azure CLI is logged in for homepage/materials/FCP SLIs).",
  );
  lines.push(
    "3. Monthly GitHub Action (`.github/workflows/ops-scorecard-monthly.yml`) does the same on a schedule and opens a PR titled `OPS: monthly operational excellence scorecard`.",
  );
  lines.push(
    "4. Do not auto-merge that PR; humans review score changes.",
  );
  lines.push("");
  lines.push(
    "History: optional prior snapshots may live under `docs/ops/scorecard-history/` later — not required for Phase 0.",
  );
  lines.push("");

  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const evaluation = JSON.parse(readFileSync(EVAL_PATH, "utf8"));

  if (args.monthly || args.date) {
    evaluation.lastReviewed = todayUtc(args.date);
  }

  if (args.monthly) {
    evaluation.reviewSource = args.azure
      ? "monthly-workflow (+ Azure SLI attempt)"
      : "monthly-workflow";

    if (args.azure) {
      console.log("Probing prod homepage / materials / FCP SLIs (read-only)…");
      const probes = {
        homepage: probeHomepageAvailability(),
        materials: probeMaterialsAvailability(),
        fcp: probeHomepageFcp(),
      };
      console.log(probes.homepage.note);
      console.log(probes.materials.note);
      console.log(probes.fcp.note);
      applyAzureSlis(evaluation, probes);
    } else {
      markSlisStaleSkipped(
        evaluation,
        "Azure SLI probe skipped this run; qualitative dimensions refreshed.",
      );
    }
  } else if (args.azure) {
    console.log("Probing prod homepage / materials / FCP SLIs (read-only)…");
    const probes = {
      homepage: probeHomepageAvailability(),
      materials: probeMaterialsAvailability(),
      fcp: probeHomepageFcp(),
    };
    console.log(probes.homepage.note);
    console.log(probes.materials.note);
    console.log(probes.fcp.note);
    applyAzureSlis(evaluation, probes);
  }

  const overall = round1(weightedOverall(evaluation.dimensions));
  // Keep human verdict unless empty.
  if (!evaluation.verdict) {
    evaluation.verdict = `Weighted overall ${overall.toFixed(1)} / 5.`;
  }

  const markdown = renderScorecard(evaluation);
  assertNoSecrets(markdown, "scorecard markdown");
  assertNoSecrets(JSON.stringify(evaluation), "scorecard evaluation JSON");

  writeFileSync(EVAL_PATH, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
  writeFileSync(SCORECARD_PATH, markdown, "utf8");

  console.log(
    `Wrote ${SCORECARD_PATH} (overall ${overall.toFixed(1)}, lastReviewed ${evaluation.lastReviewed})`,
  );
}

main();
