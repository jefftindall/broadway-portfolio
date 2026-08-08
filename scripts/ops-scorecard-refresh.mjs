#!/usr/bin/env node
/**
 * OPS-P0-004 — Refresh the operational excellence scorecard.
 *
 * Reads docs/ops/scorecard-evaluation.json, optionally probes prod homepage
 * availability via Azure CLI (when logged in), recomputes weighted overall,
 * and regenerates docs/ops/operational-excellence-scorecard.md.
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

function runAz(args) {
  return execFileSync("az", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
}

/**
 * Optional read-only SLI: prod homepage availability % over the last 7 days.
 * On any failure, returns { ok: false, note } without throwing.
 */
function probeHomepageAvailability() {
  try {
    runAz(["account", "show", "-o", "none"]);
  } catch {
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
        note: "App Insights returned no availability datapoints for the last 7 days.",
      };
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
    const safe = msg.replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "<redacted>",
    );
    return {
      ok: false,
      note: `Homepage availability query failed; SLI left stale. (${safe.slice(0, 200)})`,
    };
  }
}

function applyAzureSli(evaluation, probe) {
  const sloDim = evaluation.dimensions.find((d) => d.id === "slo");
  const slo1 = evaluation.committedSlos.find((s) => s.id === "SLO-1");

  if (!probe.ok) {
    if (sloDim) {
      sloDim.sliStatus = "stale";
      sloDim.sliNote = probe.note;
    }
    if (slo1) {
      slo1.status = "stale";
      slo1.note = probe.note;
    }
    return;
  }

  if (sloDim) {
    sloDim.sliStatus = "ok";
    sloDim.sliNote = probe.note;
    sloDim.evidence = `Homepage SLI measurable: ${probe.note}`;
  }
  if (slo1) {
    slo1.status = probe.meets ? "met" : "missed";
    slo1.note = probe.note;
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
    "2. Run `node scripts/ops-scorecard-refresh.mjs` (add `--monthly --azure` when Azure CLI is logged in for homepage SLI).",
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
      console.log("Probing prod homepage availability (read-only)…");
      const probe = probeHomepageAvailability();
      console.log(probe.note);
      applyAzureSli(evaluation, probe);
    } else {
      const sloDim = evaluation.dimensions.find((d) => d.id === "slo");
      if (sloDim && sloDim.sliStatus !== "blocked") {
        sloDim.sliStatus = "stale";
        sloDim.sliNote =
          "Azure SLI probe skipped this run; qualitative dimensions refreshed.";
      }
      const slo1 = evaluation.committedSlos.find((s) => s.id === "SLO-1");
      if (slo1 && slo1.status !== "blocked") {
        slo1.status = "stale";
        slo1.note =
          "Azure SLI probe skipped this run; see OPS-P0-004 workflow Azure login.";
      }
    }
  } else if (args.azure) {
    console.log("Probing prod homepage availability (read-only)…");
    const probe = probeHomepageAvailability();
    console.log(probe.note);
    applyAzureSli(evaluation, probe);
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
