#!/usr/bin/env node
/**
 * OPS-P0-004 / OPS-P5 — Refresh the operational excellence scorecard.
 *
 * Reads docs/ops/scorecard-evaluation.json, optionally probes prod SLIs
 * (homepage + materials availability, homepage FCP p75, Studio SLO-2/3,
 * optional inquiry accept rate) plus previous-month site performance
 * (GA4 visits/top pages + App Insights contacts/Studio publishes) and
 * subscription spend via Azure CLI when logged in, recomputes weighted
 * overall, and regenerates docs/ops/operational-excellence-scorecard.md.
 *
 * Never writes emails, phones, or secret values into the scorecard or stdout.
 *
 * Usage:
 *   node scripts/ops-scorecard-refresh.mjs
 *   node scripts/ops-scorecard-refresh.mjs --monthly [--azure]
 *   node scripts/ops-scorecard-refresh.mjs --date 2026-09-01
 *
 * GA Data API (optional): GA_PROPERTY_ID + GA_DATA_API_SA_JSON_FILE
 *   (see scripts/fetch-ga-scorecard-secrets.sh)
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { withPageLabel } from "./lib/page-labels.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EVAL_PATH = join(ROOT, "docs/ops/scorecard-evaluation.json");
const SCORECARD_PATH = join(ROOT, "docs/ops/operational-excellence-scorecard.md");

const PROD_APPI = "appi-elyse-portfolio-prod";
const PROD_RG = "rg-elyse-portfolio-prod";
const HOMEPAGE_AVAIL_TARGET = 99.8;
const MATERIALS_AVAIL_TARGET = 99.8;
const FCP_P75_TARGET_MS = 1500;
const FCP_MIN_SAMPLES = 10;
const STUDIO_PUBLISH_SUCCESS_TARGET = 95;
const STUDIO_PUBLISH_MIN_ATTEMPTS = 3;
const STUDIO_LATENCY_P95_TARGET_MS = 1_200_000; // 20 minutes
const INQUIRY_ACCEPT_TARGET = 99;
const INQUIRY_MIN_SAMPLES = 3;
const TOP_PAGES_LIMIT = 8;
/** Content freshness thresholds (days). Homepage is tighter; materials are seasonal. */
const HOMEPAGE_FRESH_WATCH_DAYS = 30;
const HOMEPAGE_FRESH_STALE_DAYS = 60;
const MATERIALS_FRESH_WATCH_DAYS = 183; // ~6 months
const MATERIALS_FRESH_STALE_DAYS = 365; // ~12 months
/** Keep in sync with infra/bootstrap/budget.tf + docs/runbooks/cost-and-quotas.md (ceil(expected × 1.25)). */
const SUBSCRIPTION_BUDGET_USD = 34;

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

function resolveAzInvocation() {
  if (process.platform !== "win32") {
    return { command: "az", argsPrefix: [] };
  }
  // Windows ships az as a .cmd wrapper around python -IBm azure.cli. Node cannot
  // spawn .cmd without shell:true (DEP0190), so call the Python entrypoint directly.
  const candidates = [
    join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft SDKs", "Azure", "CLI2", "python.exe"),
    join(
      process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
      "Microsoft SDKs",
      "Azure",
      "CLI2",
      "python.exe",
    ),
  ];
  for (const python of candidates) {
    if (existsSync(python)) {
      return { command: python, argsPrefix: ["-IBm", "azure.cli"] };
    }
  }
  // Fallback: az.cmd with shell (local-only; CI is Linux).
  return { command: "az.cmd", argsPrefix: [], shell: true };
}

function runAz(args) {
  const inv = resolveAzInvocation();
  return execFileSync(inv.command, [...inv.argsPrefix, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
    shell: Boolean(inv.shell),
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

function subscriptionId() {
  return runAz(["account", "show", "--query", "id", "-o", "tsv"]).trim();
}

/** Calendar month range ending before `anchorYmd` (UTC). monthsAgo=1 → previous month. */
function monthRangeUtc(anchorYmd, monthsAgo) {
  const d = new Date(`${anchorYmd}T00:00:00.000Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m - monthsAgo, 1));
  const end = new Date(Date.UTC(y, m - monthsAgo + 1, 1));
  const label = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    label,
  };
}

function querySubscriptionActualCost(fromYmd, toYmd) {
  const sub = subscriptionId();
  const body = {
    type: "ActualCost",
    timeframe: "Custom",
    timePeriod: { from: fromYmd, to: toYmd },
    dataset: {
      granularity: "None",
      aggregation: {
        totalCost: { name: "Cost", function: "Sum" },
      },
    },
  };
  const raw = runAz([
    "rest",
    "--method",
    "post",
    "--url",
    `https://management.azure.com/subscriptions/${sub}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`,
    "--body",
    JSON.stringify(body),
    "-o",
    "json",
  ]);
  const parsed = JSON.parse(raw);
  const rows = parsed?.properties?.rows ?? parsed?.rows ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  // Row is typically [cost] or [cost, currency] depending on columns.
  const cost = Number(rows[0][0]);
  if (!Number.isFinite(cost)) return null;
  return cost;
}

/**
 * OPS-P4-002 — last calendar month ActualCost + MoM vs prior month; vs subscription budget.
 * Dollar amounts only — never emails or secrets.
 */
function probeSubscriptionSpend(anchorYmd) {
  if (!azureLoggedIn()) {
    return {
      ok: false,
      note: "Azure CLI not logged in; subscription spend probe left stale.",
    };
  }

  const last = monthRangeUtc(anchorYmd, 1);
  const prior = monthRangeUtc(anchorYmd, 2);

  try {
    const lastMonthUsd = querySubscriptionActualCost(last.from, last.to);
    const priorMonthUsd = querySubscriptionActualCost(prior.from, prior.to);
    if (lastMonthUsd == null) {
      return {
        ok: false,
        note: `Cost Management returned no ActualCost rows for ${last.label}; spend left stale (data may lag).`,
      };
    }

    const priorOk = priorMonthUsd != null;
    const momDeltaUsd = priorOk ? round1(lastMonthUsd - priorMonthUsd) : null;
    const momDeltaPct =
      priorOk && priorMonthUsd !== 0
        ? round1(((lastMonthUsd - priorMonthUsd) / Math.abs(priorMonthUsd)) * 100)
        : priorOk && priorMonthUsd === 0 && lastMonthUsd === 0
          ? 0
          : priorOk && priorMonthUsd === 0
            ? null
            : null;
    const budgetUsedPct = round1((lastMonthUsd / SUBSCRIPTION_BUDGET_USD) * 100);
    const underBudget = lastMonthUsd <= SUBSCRIPTION_BUDGET_USD;

    let trend = "flat";
    if (momDeltaUsd != null) {
      if (momDeltaUsd > 0.01) trend = "up";
      else if (momDeltaUsd < -0.01) trend = "down";
    }

    const momNote =
      momDeltaUsd == null
        ? "MoM unavailable (no prior-month rows)."
        : `MoM ${trend} ${momDeltaUsd >= 0 ? "+" : ""}$${momDeltaUsd.toFixed(2)}${
            momDeltaPct == null ? "" : ` (${momDeltaPct >= 0 ? "+" : ""}${momDeltaPct}%)`
          }.`;

    return {
      ok: true,
      lastMonthLabel: last.label,
      priorMonthLabel: prior.label,
      lastMonthUsd: round1(lastMonthUsd),
      priorMonthUsd: priorOk ? round1(priorMonthUsd) : null,
      momDeltaUsd,
      momDeltaPct,
      trend,
      budgetUsd: SUBSCRIPTION_BUDGET_USD,
      budgetUsedPct,
      underBudget,
      note: `Subscription ActualCost ${last.label}: $${round1(lastMonthUsd).toFixed(2)} (${budgetUsedPct}% of $${SUBSCRIPTION_BUDGET_USD} budget). ${momNote}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const short = /429|Too Many Requests/i.test(msg)
      ? "Cost Management returned 429 (rate limited); retry later."
      : redact(msg).replace(/\s+/g, " ").slice(0, 160);
    return {
      ok: false,
      note: `Cost Management spend probe failed: ${short}`,
    };
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

/**
 * Studio publish success over 28d (OPS-P3-001 / SLO-2).
 * Excludes permission denials (reason=unauthorized) and draft-mode UI failures.
 */
function probeStudioPublishSuccess() {
  if (!azureLoggedIn()) {
    return {
      ok: false,
      note: "Azure CLI not logged in; Studio publish success SLI left stale.",
    };
  }

  const query = `
customEvents
| where timestamp > ago(28d)
| where name in ("StudioPublishUiSuccess", "StudioPublishUiFailed")
| extend operation = tostring(customDimensions.operation)
| extend reason = tostring(customDimensions.reason)
| where name == "StudioPublishUiSuccess"
    or (name == "StudioPublishUiFailed" and operation == "publish" and reason != "unauthorized")
| summarize
    successes = countif(name == "StudioPublishUiSuccess"),
    failures = countif(name == "StudioPublishUiFailed"),
    attempts = count()
| extend successPct = 100.0 * successes / attempts
| project successPct, successes, failures, attempts
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
    const successPct = Number(row?.[0]);
    const attempts = Number(row?.[3] ?? 0);
    if (!attempts || attempts < STUDIO_PUBLISH_MIN_ATTEMPTS || !Number.isFinite(successPct)) {
      return {
        ok: false,
        note: attempts
          ? `Studio publish has ${attempts} attempt(s) (<${STUDIO_PUBLISH_MIN_ATTEMPTS}); left stale.`
          : "No Studio publish UI events in the last 28 days; SLO-2 left stale.",
      };
    }
    const pct = round1(successPct);
    return {
      ok: true,
      pct,
      meets: pct >= STUDIO_PUBLISH_SUCCESS_TARGET,
      note: `Studio publish success ${pct}% over ${attempts} attempt(s) (target ${STUDIO_PUBLISH_SUCCESS_TARGET}% / 28d).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      note: `Studio publish success query failed; SLI left stale. (${redact(msg).slice(0, 200)})`,
    };
  }
}

/**
 * Publish → live p95 over 28d (OPS-P3-001 / SLO-3). Target ≤ 20 minutes.
 */
function probeStudioPublishLatency() {
  if (!azureLoggedIn()) {
    return {
      ok: false,
      note: "Azure CLI not logged in; Studio publish latency SLI left stale.",
    };
  }

  const query = `
customMetrics
| where timestamp > ago(28d)
| where name == "StudioPublishToProdDurationMs"
| summarize samples = count(), p95 = percentile(value, 95)
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
    const p95 = Number(row?.[1]);
    if (!samples || !Number.isFinite(p95)) {
      return {
        ok: false,
        note: "No StudioPublishToProdDurationMs samples in the last 28 days; SLO-3 left stale.",
      };
    }
    const ms = Math.round(p95);
    const minutes = round1(ms / 60_000);
    return {
      ok: true,
      p95: ms,
      meets: ms <= STUDIO_LATENCY_P95_TARGET_MS,
      note: `Publish→live p95 ${minutes}m (${ms}ms) over ${samples} sample(s) (target ≤ 20m / 28d).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      note: `Studio publish latency query failed; SLI left stale. (${redact(msg).slice(0, 200)})`,
    };
  }
}

/**
 * Inquiry accept rate over 28d (OPS-P3-004 optional SLI).
 * Excludes turnstile_rejected (bots) and validation (client 4xx).
 */
function probeInquiryAcceptRate() {
  if (!azureLoggedIn()) {
    return {
      ok: false,
      note: "Azure CLI not logged in; inquiry accept-rate SLI left stale.",
    };
  }

  const query = `
customEvents
| where timestamp > ago(28d)
| where name in ("ContactInquiryReceived", "ContactInquiryFailed")
| extend errorKind = tostring(customDimensions.errorKind)
| where name == "ContactInquiryReceived"
    or (name == "ContactInquiryFailed"
        and errorKind !in ("turnstile_rejected", "validation"))
| summarize
    accepted = countif(name == "ContactInquiryReceived"),
    failed = countif(name == "ContactInquiryFailed"),
    n = count()
| extend acceptPct = 100.0 * accepted / n
| project acceptPct, accepted, failed, n
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
    const acceptPct = Number(row?.[0]);
    const n = Number(row?.[3] ?? 0);
    if (!n || n < INQUIRY_MIN_SAMPLES || !Number.isFinite(acceptPct)) {
      return {
        ok: false,
        note: n
          ? `Inquiry SLI has ${n} sample(s) (<${INQUIRY_MIN_SAMPLES}); left stale.`
          : "No inquiry events in the last 28 days (excluding bots/validation); left stale.",
      };
    }
    const pct = round1(acceptPct);
    return {
      ok: true,
      pct,
      meets: pct >= INQUIRY_ACCEPT_TARGET,
      note: `Inquiry accept rate ${pct}% over ${n} attempt(s) (intended ${INQUIRY_ACCEPT_TARGET}% / 28d; not committed).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      note: `Inquiry accept-rate query failed; SLI left stale. (${redact(msg).slice(0, 200)})`,
    };
  }
}

/**
 * OPS-P5-004 — previous calendar month contact + Studio publish counts (App Insights).
 * Counts and casting/lesson split only — never inquiry PII.
 */
function probeSiteActivityAppInsights(anchorYmd) {
  const month = monthRangeUtc(anchorYmd, 1);
  if (!azureLoggedIn()) {
    return {
      ok: false,
      monthLabel: month.label,
      note: "Azure CLI not logged in; App Insights site activity left stale.",
    };
  }

  const contactsQuery = `
customEvents
| where timestamp >= datetime(${month.from}) and timestamp < datetime(${month.to})
| where name == "ContactInquiryReceived"
| extend type = tostring(customDimensions.type)
| summarize
    total = count(),
    casting = countif(type == "casting"),
    lesson = countif(type == "lesson")
| project total, casting, lesson
`.trim();

  const updatesQuery = `
customEvents
| where timestamp >= datetime(${month.from}) and timestamp < datetime(${month.to})
| where name == "StudioPublishUiSuccess"
| summarize studioPublishes = count()
| project studioPublishes
`.trim();

  try {
    const contactsRaw = runAz([
      "monitor",
      "app-insights",
      "query",
      "--app",
      PROD_APPI,
      "--resource-group",
      PROD_RG,
      "--analytics-query",
      contactsQuery,
      "-o",
      "json",
    ]);
    const updatesRaw = runAz([
      "monitor",
      "app-insights",
      "query",
      "--app",
      PROD_APPI,
      "--resource-group",
      PROD_RG,
      "--analytics-query",
      updatesQuery,
      "-o",
      "json",
    ]);
    const contactsRow = JSON.parse(contactsRaw)?.tables?.[0]?.rows?.[0];
    const updatesRow = JSON.parse(updatesRaw)?.tables?.[0]?.rows?.[0];
    const total = Number(contactsRow?.[0] ?? 0);
    const casting = Number(contactsRow?.[1] ?? 0);
    const lesson = Number(contactsRow?.[2] ?? 0);
    const studioPublishes = Number(updatesRow?.[0] ?? 0);
    return {
      ok: true,
      monthLabel: month.label,
      contacts: {
        total: Number.isFinite(total) ? total : 0,
        casting: Number.isFinite(casting) ? casting : 0,
        lesson: Number.isFinite(lesson) ? lesson : 0,
        source: "app-insights",
        note: "",
      },
      updates: {
        studioPublishes: Number.isFinite(studioPublishes) ? studioPublishes : 0,
        source: "app-insights",
        note: "",
      },
      note: `App Insights ${month.label}: ${Number.isFinite(total) ? total : 0} contact(s), ${Number.isFinite(studioPublishes) ? studioPublishes : 0} Studio publish(es).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      monthLabel: month.label,
      note: `App Insights site activity query failed; left stale. (${redact(msg).slice(0, 200)})`,
    };
  }
}

/**
 * OPS-P5-003 — previous calendar month visits + top pages via GA4 Data API.
 * Paths and counts only. Soft-fail when secrets missing or API errors.
 */
async function probeSiteActivityGa(anchorYmd) {
  const month = monthRangeUtc(anchorYmd, 1);
  const propertyId = String(process.env.GA_PROPERTY_ID || "").trim();
  const keyFile = String(process.env.GA_DATA_API_SA_JSON_FILE || "").trim();

  if (!propertyId || propertyId === "REPLACE_ME" || !keyFile || !existsSync(keyFile)) {
    return {
      ok: false,
      monthLabel: month.label,
      note: "GA Data API credentials not loaded (GA-PROPERTY-ID / GA-DATA-API-SA-JSON); visits/top pages left stale.",
    };
  }

  try {
    const client = new BetaAnalyticsDataClient({ keyFilename: keyFile });
    const property = `properties/${propertyId}`;
    // Data API endDate is inclusive; month.to is exclusive (first of next month).
    const endInclusive = new Date(`${month.to}T00:00:00.000Z`);
    endInclusive.setUTCDate(endInclusive.getUTCDate() - 1);
    const endDate = endInclusive.toISOString().slice(0, 10);
    const dateRanges = [{ startDate: month.from, endDate }];

    const [totalsRes] = await client.runReport({
      property,
      dateRanges,
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    });
    const totalRow = totalsRes?.rows?.[0]?.metricValues;
    const sessions = Number(totalRow?.[0]?.value ?? 0);
    const users = Number(totalRow?.[1]?.value ?? 0);

    const [pagesRes] = await client.runReport({
      property,
      dateRanges,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: TOP_PAGES_LIMIT + 5,
      dimensionFilter: {
        notExpression: {
          filter: {
            fieldName: "pagePath",
            stringFilter: {
              matchType: "BEGINS_WITH",
              value: "/studio",
            },
          },
        },
      },
    });

    const topPages = [];
    for (const row of pagesRes?.rows || []) {
      const path = String(row.dimensionValues?.[0]?.value || "").trim() || "/";
      if (path.startsWith("/studio")) continue;
      // Strip query strings if GA ever returns them
      const clean = path.split("?")[0] || "/";
      topPages.push(
        withPageLabel({
          path: clean,
          sessions: Number(row.metricValues?.[0]?.value ?? 0),
        }),
      );
      if (topPages.length >= TOP_PAGES_LIMIT) break;
    }

    return {
      ok: true,
      monthLabel: month.label,
      visits: {
        sessions: Number.isFinite(sessions) ? sessions : 0,
        users: Number.isFinite(users) ? users : 0,
        source: "ga4",
        note: "",
      },
      topPages,
      note: `GA4 ${month.label}: ${Number.isFinite(sessions) ? sessions : 0} session(s), ${Number.isFinite(users) ? users : 0} user(s).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      monthLabel: month.label,
      note: `GA Data API probe failed; visits/top pages left stale. (${redact(msg).slice(0, 200)})`,
    };
  }
}

/**
 * OPS content freshness — days since last git commit touching homepage / resume / headshot.
 * Amber (watch) after 30 days; red (missed) after 60 days. No secrets; local git only.
 */
function gitLastCommitIso(paths) {
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", ...paths],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
        cwd: ROOT,
      },
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

function freshnessStatus(days, watchDays, staleDays) {
  if (!Number.isFinite(days)) return "stale";
  if (days > staleDays) return "missed";
  if (days > watchDays) return "watch";
  return "ok";
}

function probeOneContentFreshness(id, label, paths, anchorYmd, watchDays, staleDays) {
  const iso = gitLastCommitIso(paths);
  if (!iso) {
    return {
      id,
      label,
      status: "stale",
      daysSinceUpdate: null,
      lastUpdated: null,
      watchDays,
      staleDays,
      note: `Could not read git history for ${label}; freshness left stale.`,
    };
  }
  const last = new Date(iso);
  const anchor = new Date(`${anchorYmd}T12:00:00.000Z`);
  const days = Math.max(
    0,
    Math.floor((anchor.getTime() - last.getTime()) / 86_400_000),
  );
  const status = freshnessStatus(days, watchDays, staleDays);
  const lastUpdated = iso.slice(0, 10);
  let note;
  if (status === "ok") {
    note = `Updated ${days} day(s) ago (${lastUpdated}).`;
  } else if (status === "watch") {
    note = `No update in ${days} days (since ${lastUpdated}) — overdue for a refresh.`;
  } else {
    note = `No update in ${days} days (since ${lastUpdated}) — content looks stale.`;
  }
  return {
    id,
    label,
    status,
    daysSinceUpdate: days,
    lastUpdated,
    watchDays,
    staleDays,
    note,
  };
}

function probeContentFreshness(anchorYmd) {
  const ymd = anchorYmd || todayUtc();
  return {
    homepage: probeOneContentFreshness(
      "homepage",
      "Homepage",
      ["src/pages/index.astro"],
      ymd,
      HOMEPAGE_FRESH_WATCH_DAYS,
      HOMEPAGE_FRESH_STALE_DAYS,
    ),
    resume: probeOneContentFreshness(
      "resume",
      "Resume",
      [
        "public/downloads/elyse-tindall-resume.pdf",
        "src/content/resume-meta.json",
        "src/content/shows",
      ],
      ymd,
      MATERIALS_FRESH_WATCH_DAYS,
      MATERIALS_FRESH_STALE_DAYS,
    ),
    headshot: probeOneContentFreshness(
      "headshot",
      "Headshot",
      ["public/downloads/elyse-tindall-headshot-theatrical.jpg"],
      ymd,
      MATERIALS_FRESH_WATCH_DAYS,
      MATERIALS_FRESH_STALE_DAYS,
    ),
  };
}

/**
 * Merge App Insights + GA probes into sitePerformance (OPS-P5).
 */
function buildSitePerformance(aiProbe, gaProbe, anchorYmd) {
  const monthLabel =
    aiProbe?.monthLabel || gaProbe?.monthLabel || monthRangeUtc(anchorYmd, 1).label;
  const notes = [];
  let status = "ok";

  const block = {
    monthLabel,
    status: "ok",
    visits: {
      sessions: 0,
      users: 0,
      source: "ga4",
      note: "",
    },
    contacts: {
      total: 0,
      casting: 0,
      lesson: 0,
      source: "app-insights",
      note: "",
    },
    updates: {
      studioPublishes: 0,
      source: "app-insights",
      note: "",
    },
    topPages: [],
    note: "",
  };

  if (aiProbe?.ok) {
    block.contacts = { ...aiProbe.contacts };
    block.updates = { ...aiProbe.updates };
    notes.push(aiProbe.note);
  } else {
    status = "stale";
    block.contacts.note = aiProbe?.note || "App Insights contacts unavailable.";
    block.updates.note = aiProbe?.note || "App Insights Studio publishes unavailable.";
    notes.push(aiProbe?.note || "App Insights site activity stale.");
  }

  if (gaProbe?.ok) {
    block.visits = { ...gaProbe.visits };
    block.topPages = gaProbe.topPages || [];
    notes.push(gaProbe.note);
  } else {
    status = "stale";
    block.visits.note = gaProbe?.note || "GA4 visits unavailable.";
    notes.push(gaProbe?.note || "GA4 visits/top pages stale.");
  }

  block.status = status;
  block.note = notes.filter(Boolean).join(" ");
  return block;
}

function setSlo(evaluation, id, patch) {
  const slo = evaluation.committedSlos.find((s) => s.id === id);
  if (!slo) return;
  Object.assign(slo, patch);
}

function setOptionalSlo(evaluation, id, patch) {
  if (!Array.isArray(evaluation.optionalSlos)) {
    evaluation.optionalSlos = [];
  }
  let slo = evaluation.optionalSlos.find((s) => s.id === id);
  if (!slo) {
    slo = { id, name: id, target: "", status: "stale", note: "" };
    evaluation.optionalSlos.push(slo);
  }
  Object.assign(slo, patch);
}

function applyAzureSlis(evaluation, probes) {
  const {
    homepage,
    materials,
    fcp,
    studioSuccess,
    studioLatency,
    inquiry,
    spend,
    siteActivityAi,
    siteActivityGa,
  } = probes;
  const sloDim = evaluation.dimensions.find((d) => d.id === "slo");
  const costDim = evaluation.dimensions.find((d) => d.id === "cost");
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

  if (studioSuccess.ok) {
    setSlo(evaluation, "SLO-2", {
      status: studioSuccess.meets ? "met" : "missed",
      note: studioSuccess.note,
    });
    notes.push(studioSuccess.note);
  } else {
    setSlo(evaluation, "SLO-2", {
      status: "stale",
      note: studioSuccess.note,
    });
    notes.push(studioSuccess.note);
  }

  if (studioLatency.ok) {
    setSlo(evaluation, "SLO-3", {
      status: studioLatency.meets ? "met" : "missed",
      note: studioLatency.note,
    });
    notes.push(studioLatency.note);
  } else {
    setSlo(evaluation, "SLO-3", {
      status: "stale",
      note: studioLatency.note,
    });
    notes.push(studioLatency.note);
  }

  if (inquiry) {
    if (inquiry.ok) {
      setOptionalSlo(evaluation, "SLO-5", {
        name: "Inquiry accept rate",
        target: "99% / 28d (optional)",
        status: inquiry.meets ? "met" : "missed",
        note: inquiry.note,
      });
      notes.push(inquiry.note);
    } else {
      setOptionalSlo(evaluation, "SLO-5", {
        name: "Inquiry accept rate",
        target: "99% / 28d (optional)",
        status: "stale",
        note: inquiry.note,
      });
      notes.push(inquiry.note);
    }
  }

  if (spend) {
    if (spend.ok) {
      evaluation.costProbe = {
        lastMonthLabel: spend.lastMonthLabel,
        priorMonthLabel: spend.priorMonthLabel,
        lastMonthUsd: spend.lastMonthUsd,
        priorMonthUsd: spend.priorMonthUsd,
        momDeltaUsd: spend.momDeltaUsd,
        momDeltaPct: spend.momDeltaPct,
        trend: spend.trend,
        budgetUsd: spend.budgetUsd,
        budgetUsedPct: spend.budgetUsedPct,
        underBudget: spend.underBudget,
        status: "ok",
        note: spend.note,
      };
      if (costDim) {
        costDim.score = Math.max(costDim.score, 4.0);
        costDim.evidence = `Subscription budget $${SUBSCRIPTION_BUDGET_USD}/mo (OPS-P4-001); ${spend.note}`;
        costDim.gap = "Gemini/Google console budget alert still manual";
        costDim.sliStatus = "ok";
        costDim.sliNote = spend.note;
      }
    } else {
      // Keep a prior successful costProbe when the re-probe soft-fails (e.g. 429).
      const prior = evaluation.costProbe;
      if (prior?.status === "ok" && prior.lastMonthUsd != null) {
        evaluation.costProbe = {
          ...prior,
          note: `${prior.note} Re-probe skipped: ${spend.note}`,
        };
        if (costDim) {
          costDim.sliStatus = "ok";
          costDim.sliNote = evaluation.costProbe.note;
          costDim.gap = "Gemini/Google console budget alert still manual";
        }
      } else {
        evaluation.costProbe = {
          status: "stale",
          budgetUsd: SUBSCRIPTION_BUDGET_USD,
          note: spend.note,
        };
        if (costDim) {
          costDim.sliStatus = "stale";
          costDim.sliNote = spend.note;
          costDim.evidence =
            costDim.evidence ||
            `Subscription budget $${SUBSCRIPTION_BUDGET_USD}/mo (OPS-P4-001); spend probe pending`;
          costDim.gap = "Gemini/Google console budget alert still manual; spend probe stale";
        }
      }
    }
  }

  if (siteActivityAi || siteActivityGa) {
    evaluation.sitePerformance = buildSitePerformance(
      siteActivityAi,
      siteActivityGa,
      evaluation.lastReviewed || todayUtc(),
    );
    if (evaluation.sitePerformance.note) {
      notes.push(evaluation.sitePerformance.note);
    }
  }

  if (sloDim) {
    const anyOk =
      homepage.ok ||
      materials.ok ||
      fcp.ok ||
      studioSuccess.ok ||
      studioLatency.ok;
    sloDim.sliStatus = anyOk ? "ok" : "stale";
    sloDim.sliNote = notes.join(" ");
    if (anyOk) {
      const okNotes = [
        homepage,
        materials,
        fcp,
        studioSuccess,
        studioLatency,
      ]
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
  for (const id of ["SLO-1", "SLO-2", "SLO-3", "SLO-4", "SLO-6"]) {
    const slo = evaluation.committedSlos.find((s) => s.id === id);
    if (slo && slo.status !== "blocked") {
      slo.status = "stale";
      slo.note = reason;
    }
  }
  if (Array.isArray(evaluation.optionalSlos)) {
    for (const slo of evaluation.optionalSlos) {
      if (slo.status !== "blocked") {
        slo.status = "stale";
        slo.note = reason;
      }
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

  if (Array.isArray(evaluation.optionalSlos) && evaluation.optionalSlos.length) {
    lines.push("");
    lines.push("## Optional SLIs (not committed)");
    lines.push("");
    lines.push("| ID | SLO | Target | Status | Note |");
    lines.push("|----|-----|--------|--------|------|");
    for (const s of evaluation.optionalSlos) {
      lines.push(
        `| ${s.id} | ${s.name} | ${s.target} | ${s.status} | ${s.note} |`,
      );
    }
  }

  const cp = evaluation.costProbe;
  if (cp) {
    lines.push("");
    lines.push("## Subscription cost (this review)");
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("|-------|-------|");
    lines.push(`| **Budget** | $${cp.budgetUsd ?? SUBSCRIPTION_BUDGET_USD} / month |`);
    if (cp.status === "ok") {
      lines.push(
        `| **Last month (${cp.lastMonthLabel})** | $${Number(cp.lastMonthUsd).toFixed(2)} (${cp.budgetUsedPct}% of budget) |`,
      );
      lines.push(
        `| **Prior month (${cp.priorMonthLabel})** | ${
          cp.priorMonthUsd == null
            ? "n/a"
            : `$${Number(cp.priorMonthUsd).toFixed(2)}`
        } |`,
      );
      const mom =
        cp.momDeltaUsd == null
          ? "n/a"
          : `${cp.trend} ${cp.momDeltaUsd >= 0 ? "+" : ""}$${Number(cp.momDeltaUsd).toFixed(2)}${
              cp.momDeltaPct == null
                ? ""
                : ` (${cp.momDeltaPct >= 0 ? "+" : ""}${cp.momDeltaPct}%)`
            }`;
      lines.push(`| **MoM** | ${mom} |`);
      lines.push(
        `| **Under budget** | ${cp.underBudget ? "yes" : "no"} |`,
      );
    } else {
      lines.push(`| **Status** | stale |`);
      lines.push(`| **Note** | ${cp.note || "Spend probe unavailable"} |`);
    }
  }

  const sp = evaluation.sitePerformance;
  if (sp) {
    lines.push("");
    lines.push("## Site performance (previous month)");
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("|-------|-------|");
    lines.push(`| **Month** | ${sp.monthLabel || "—"} |`);
    lines.push(`| **Status** | ${sp.status || "stale"} |`);
    if (sp.visits) {
      const vNote = sp.visits.note ? ` — ${sp.visits.note}` : "";
      lines.push(
        `| **Visits (GA4)** | ${sp.visits.sessions ?? 0} sessions · ${sp.visits.users ?? 0} users${vNote} |`,
      );
    }
    if (sp.contacts) {
      const cNote = sp.contacts.note ? ` — ${sp.contacts.note}` : "";
      lines.push(
        `| **Contacts (App Insights)** | ${sp.contacts.total ?? 0} total (${sp.contacts.casting ?? 0} casting · ${sp.contacts.lesson ?? 0} lesson)${cNote} |`,
      );
    }
    if (sp.updates) {
      const uNote = sp.updates.note ? ` — ${sp.updates.note}` : "";
      lines.push(
        `| **Studio publishes** | ${sp.updates.studioPublishes ?? 0}${uNote} |`,
      );
    }
    if (Array.isArray(sp.topPages) && sp.topPages.length) {
      lines.push(`| **Top pages** | See list below |`);
    } else if (sp.visits?.note || sp.status === "stale") {
      lines.push(`| **Top pages** | — |`);
    }
    if (sp.note) {
      lines.push(`| **Note** | ${sp.note} |`);
    }
    if (Array.isArray(sp.topPages) && sp.topPages.length) {
      lines.push("");
      for (const p of sp.topPages) {
        const label = p.label || p.path;
        lines.push(`- ${label} — ${p.sessions} visit(s)`);
      }
    }
  }

  const cf = evaluation.contentFreshness;
  if (cf && (cf.homepage || cf.resume || cf.headshot)) {
    lines.push("");
    lines.push("## Content freshness (casting materials)");
    lines.push("");
    lines.push("| Item | Status | Days since update | Note |");
    lines.push("|------|--------|-------------------|------|");
    for (const key of ["homepage", "resume", "headshot"]) {
      const row = cf[key];
      if (!row) continue;
      lines.push(
        `| ${row.label || key} | ${row.status} | ${row.daysSinceUpdate ?? "—"} | ${row.note || ""} |`,
      );
    }
  }

  lines.push("");
  lines.push("## How this file is updated");
  lines.push("");
  lines.push(
    "1. Edit [`scorecard-evaluation.json`](./scorecard-evaluation.json) (scores / evidence / gaps).",
  );
  lines.push(
    "2. Run `node scripts/ops-scorecard-refresh.mjs` (add `--monthly --azure` when Azure CLI is logged in for homepage/materials/FCP/Studio/inquiry SLIs, site performance, and subscription spend). Load GA secrets via `scripts/fetch-ga-scorecard-secrets.sh` for visits/top pages.",
  );
  lines.push(
    "3. Monthly GitHub Action (`.github/workflows/ops-scorecard-monthly.yml`) refreshes, commits to `main` via the Studio GitHub App, and emails an ACS digest to ALERT-EMAIL + SITE-CONTACT-EMAIL (recipients never written into this file).",
  );
  lines.push(
    "4. Spot-check the commit if scores move unexpectedly; optional SLIs stay `stale` until Azure probes have enough samples.",
  );
  lines.push("");
  lines.push(
    "History: optional prior snapshots may live under `docs/ops/scorecard-history/` later — not required for Phase 0.",
  );
  lines.push("");

  return lines.join("\n");
}

async function collectAzureProbes(anchorYmd) {
  const siteActivityAi = probeSiteActivityAppInsights(anchorYmd);
  const siteActivityGa = await probeSiteActivityGa(anchorYmd);
  return {
    homepage: probeHomepageAvailability(),
    materials: probeMaterialsAvailability(),
    fcp: probeHomepageFcp(),
    studioSuccess: probeStudioPublishSuccess(),
    studioLatency: probeStudioPublishLatency(),
    inquiry: probeInquiryAcceptRate(),
    spend: probeSubscriptionSpend(anchorYmd || todayUtc()),
    siteActivityAi,
    siteActivityGa,
  };
}

function logProbes(probes) {
  for (const [key, p] of Object.entries(probes)) {
    if (key === "siteActivityAi" || key === "siteActivityGa") {
      if (p?.note) console.log(p.note);
      continue;
    }
    if (p?.note) console.log(p.note);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const evaluation = JSON.parse(readFileSync(EVAL_PATH, "utf8"));

  if (args.monthly || args.date) {
    evaluation.lastReviewed = todayUtc(args.date);
  }

  // Always refresh casting-content freshness from git (no Azure / secrets).
  evaluation.contentFreshness = probeContentFreshness(
    evaluation.lastReviewed || todayUtc(),
  );
  if (Array.isArray(evaluation.sitePerformance?.topPages)) {
    evaluation.sitePerformance.topPages =
      evaluation.sitePerformance.topPages.map((p) => withPageLabel(p));
  }

  if (args.monthly) {
    evaluation.reviewSource = args.azure
      ? "monthly-workflow (+ Azure SLI attempt)"
      : "monthly-workflow";

    if (args.azure) {
      console.log(
        "Probing prod homepage / materials / FCP / Studio / inquiry SLIs + site performance + subscription spend (read-only)…",
      );
      const probes = await collectAzureProbes(evaluation.lastReviewed);
      logProbes(probes);
      applyAzureSlis(evaluation, probes);
    } else {
      markSlisStaleSkipped(
        evaluation,
        "Azure SLI probe skipped this run; qualitative dimensions refreshed.",
      );
    }
  } else if (args.azure) {
    console.log(
      "Probing prod homepage / materials / FCP / Studio / inquiry SLIs + site performance + subscription spend (read-only)…",
    );
    const probes = await collectAzureProbes(evaluation.lastReviewed || todayUtc());
    logProbes(probes);
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

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
