#!/usr/bin/env node
/**
 * OPS-P4-002 — Email monthly operational excellence scorecard digest via ACS.
 *
 * Reads docs/ops/scorecard-evaluation.json (after refresh). Recipients and ACS
 * creds come from env (Key Vault → GITHUB_ENV). Never logs recipient addresses
 * or connection strings. Digest body is scores + USD figures only.
 *
 * Env:
 *   ACS_CONNECTION_STRING, ACS_EMAIL_SENDER (required to send)
 *   ALERT_EMAIL, SITE_CONTACT_EMAIL (optional; skip send if both empty/REPLACE_ME)
 *   SCORECARD_REPO_URL (optional; default github.com/jefftindall/broadway-portfolio)
 *
 * Usage:
 *   node scripts/ops-scorecard-email.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EmailClient } from "@azure/communication-email";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EVAL_PATH = join(ROOT, "docs/ops/scorecard-evaluation.json");
const BUDGET_USD = 35;

function envTrim(name) {
  return String(process.env[name] || "").trim();
}

function isConfiguredEmail(value) {
  return Boolean(value) && value !== "REPLACE_ME" && value.includes("@");
}

function maturityFor(score) {
  if (score >= 4) return "Strong";
  if (score >= 3) return "Solid";
  if (score >= 2) return "Thin";
  return "Gap";
}

function weightedOverall(dimensions) {
  let weighted = 0;
  let weightSum = 0;
  for (const d of dimensions) {
    weighted += d.score * d.weight;
    weightSum += d.weight;
  }
  return weightSum === 0 ? 0 : Math.round((weighted / weightSum) * 10) / 10;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildBody(evaluation) {
  const overall = weightedOverall(evaluation.dimensions || []);
  const stamp = (evaluation.lastReviewed || "").slice(0, 7) || "unknown";
  const repo =
    envTrim("SCORECARD_REPO_URL") ||
    "https://github.com/jefftindall/broadway-portfolio";
  const scorecardUrl = `${repo}/blob/main/docs/ops/operational-excellence-scorecard.md`;

  const lines = [];
  lines.push(`OPS monthly operational excellence scorecard (${stamp})`);
  lines.push("");
  lines.push(`Last reviewed: ${evaluation.lastReviewed || "n/a"}`);
  lines.push(`Review source: ${evaluation.reviewSource || "n/a"}`);
  lines.push(`Weighted overall: ${overall.toFixed(1)} / 5 (target ≥ ${evaluation.targetOverall ?? 3.8})`);
  lines.push(`Verdict: ${evaluation.verdict || "n/a"}`);
  lines.push("");
  lines.push("Dimensions:");
  for (const d of evaluation.dimensions || []) {
    lines.push(
      `  - ${d.name}: ${Number(d.score).toFixed(1)} (${maturityFor(d.score)}) — gap: ${d.gap}`,
    );
  }

  lines.push("");
  lines.push("Committed SLOs:");
  for (const s of evaluation.committedSlos || []) {
    lines.push(`  - ${s.id} ${s.name}: ${s.status} (${s.target}) — ${s.note}`);
  }

  const cp = evaluation.costProbe;
  lines.push("");
  lines.push("Subscription cost:");
  lines.push(`  Budget: $${cp?.budgetUsd ?? BUDGET_USD} / month`);
  if (cp?.status === "ok") {
    lines.push(
      `  Last month (${cp.lastMonthLabel}): $${Number(cp.lastMonthUsd).toFixed(2)} (${cp.budgetUsedPct}% of budget)`,
    );
    lines.push(
      `  Prior month (${cp.priorMonthLabel}): ${
        cp.priorMonthUsd == null
          ? "n/a"
          : `$${Number(cp.priorMonthUsd).toFixed(2)}`
      }`,
    );
    const mom =
      cp.momDeltaUsd == null
        ? "n/a"
        : `${cp.trend} ${cp.momDeltaUsd >= 0 ? "+" : ""}$${Number(cp.momDeltaUsd).toFixed(2)}${
            cp.momDeltaPct == null
              ? ""
              : ` (${cp.momDeltaPct >= 0 ? "+" : ""}${cp.momDeltaPct}%)`
          }`;
    lines.push(`  MoM: ${mom}`);
    lines.push(`  Under budget: ${cp.underBudget ? "yes" : "no"}`);
  } else {
    lines.push(`  Status: stale — ${cp?.note || "spend probe unavailable"}`);
  }

  lines.push("");
  lines.push(`Living scorecard: ${scorecardUrl}`);
  lines.push("");
  lines.push(
    "This message contains scores and dollar amounts only — no alert or contact addresses.",
  );

  const plainText = lines.join("\n");
  const html = `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(
    plainText,
  )}</pre>`;
  return { stamp, plainText, html };
}

async function main() {
  const connectionString = envTrim("ACS_CONNECTION_STRING");
  const sender = envTrim("ACS_EMAIL_SENDER");
  const alertEmail = envTrim("ALERT_EMAIL");
  const siteContactEmail = envTrim("SITE_CONTACT_EMAIL");

  const recipients = [];
  if (isConfiguredEmail(alertEmail)) recipients.push(alertEmail);
  if (
    isConfiguredEmail(siteContactEmail) &&
    siteContactEmail.toLowerCase() !== alertEmail.toLowerCase()
  ) {
    recipients.push(siteContactEmail);
  }

  if (recipients.length === 0) {
    console.log(
      "No configured digest recipients (ALERT-EMAIL / SITE-CONTACT-EMAIL); skipping send.",
    );
    return;
  }

  if (!connectionString || connectionString === "REPLACE_ME") {
    console.error("ACS_CONNECTION_STRING missing; cannot send digest.");
    process.exit(1);
  }
  if (!sender || sender === "REPLACE_ME") {
    console.error("ACS_EMAIL_SENDER missing; cannot send digest.");
    process.exit(1);
  }

  const evaluation = JSON.parse(readFileSync(EVAL_PATH, "utf8"));
  const { stamp, plainText, html } = buildBody(evaluation);

  const client = new EmailClient(connectionString);
  const poller = await client.beginSend({
    senderAddress: sender,
    recipients: {
      to: recipients.map((address) => ({ address })),
    },
    content: {
      subject: `OPS monthly scorecard ${stamp}`,
      plainText,
      html,
    },
  });
  const result = await poller.pollUntilDone();
  if (result.status !== "Succeeded") {
    console.error(`ACS email status: ${result.status}`);
    process.exit(1);
  }

  console.log(
    `Sent OPS monthly scorecard digest for ${stamp} to ${recipients.length} recipient(s) (addresses not logged).`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
