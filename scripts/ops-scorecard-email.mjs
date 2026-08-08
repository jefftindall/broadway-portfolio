#!/usr/bin/env node
/**
 * OPS-P4-002 — Email monthly site health digest via ACS.
 *
 * Reads docs/ops/scorecard-evaluation.json (after refresh). Recipients and ACS
 * creds come from env (Key Vault → GITHUB_ENV). Never logs recipient addresses
 * or connection strings. Digest body is scores + USD figures only — written for
 * a non-technical reader (clear status, money, and site experience).
 *
 * Env:
 *   ACS_CONNECTION_STRING, ACS_EMAIL_SENDER (required to send)
 *   ALERT_EMAIL, SITE_CONTACT_EMAIL (optional; skip send if both empty/REPLACE_ME)
 *   SCORECARD_REPO_URL (optional; default github.com/jefftindall/broadway-portfolio)
 *
 * Usage:
 *   node scripts/ops-scorecard-email.mjs
 *   node scripts/ops-scorecard-email.mjs --preview   # print HTML to stdout, no send
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EmailClient } from "@azure/communication-email";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EVAL_PATH = join(ROOT, "docs/ops/scorecard-evaluation.json");
/** Fallback only if costProbe.budgetUsd is missing — keep in sync with budget.tf. */
const BUDGET_USD = 31;

const COLORS = {
  ink: "#1c1917",
  muted: "#57534e",
  soft: "#78716c",
  line: "#e7e5e4",
  paper: "#fafaf9",
  card: "#ffffff",
  brand: "#9f1239",
  goodBg: "#ecfdf5",
  goodFg: "#065f46",
  goodBar: "#059669",
  watchBg: "#fffbeb",
  watchFg: "#92400e",
  watchBar: "#d97706",
  badBg: "#fef2f2",
  badFg: "#991b1b",
  badBar: "#dc2626",
  infoBg: "#f5f5f4",
  infoFg: "#44403c",
};

/** Friendly labels for committed SLOs (Elyse-facing). */
const SLO_COPY = {
  "SLO-1": {
    title: "Homepage",
    blurb: "Visitors can open the home page",
  },
  "SLO-4": {
    title: "Resume & headshot",
    blurb: "Casting materials links work",
  },
  "SLO-6": {
    title: "Page speed",
    blurb: "Home page feels snappy on a phone",
  },
  "SLO-2": {
    title: "Studio publishing",
    blurb: "Updates from Studio go through",
  },
  "SLO-3": {
    title: "Live after publish",
    blurb: "Site updates show up within about 20 minutes",
  },
};

function envTrim(name) {
  return String(process.env[name] || "").trim();
}

function isConfiguredEmail(value) {
  return Boolean(value) && value !== "REPLACE_ME" && value.includes("@");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMonthLabel(isoDate) {
  if (!isoDate || isoDate.length < 7) return "this month";
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate.slice(0, 7);
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
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

function money(n) {
  return `$${Number(n).toFixed(2)}`;
}

function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (s === "met" || s === "ok") {
    return { key: "good", label: "Looking good", bg: COLORS.goodBg, fg: COLORS.goodFg, bar: COLORS.goodBar };
  }
  if (s === "missed" || s === "fail" || s === "failed") {
    return { key: "bad", label: "Needs attention", bg: COLORS.badBg, fg: COLORS.badFg, bar: COLORS.badBar };
  }
  if (s === "watch") {
    return { key: "watch", label: "Keep an eye on it", bg: COLORS.watchBg, fg: COLORS.watchFg, bar: COLORS.watchBar };
  }
  // stale / unknown
  return {
    key: "info",
    label: "Not enough data yet",
    bg: COLORS.infoBg,
    fg: COLORS.infoFg,
    bar: COLORS.soft,
  };
}

function overallTone(overall, target) {
  if (overall >= (target ?? 3.8)) {
    return {
      headline: "Everything looks healthy",
      detail: "Your site and Studio are in good shape this month.",
      ...statusTone("met"),
    };
  }
  if (overall >= 3) {
    return {
      headline: "Mostly solid — a few things to watch",
      detail: "Nothing urgent, but a couple of areas could use a closer look.",
      ...statusTone("watch"),
    };
  }
  return {
    headline: "A few items need attention",
    detail: "Jeff has the technical checklist; the highlights are below.",
    ...statusTone("missed"),
  };
}

function friendlySloNote(slo) {
  const status = String(slo.status || "").toLowerCase();
  if (status === "met") return "On track.";
  if (status === "missed") return "Below the goal — worth a look.";
  if (status === "watch") return "Close to the goal — worth watching.";
  if (status === "stale") {
    if (/no .+ in the last/i.test(slo.note || "")) {
      return "Quiet month — not enough activity to grade yet.";
    }
    return "We did not get a clear reading this month.";
  }
  return slo.note || "—";
}

function spendSummary(cp, budgetUsd) {
  if (!cp || cp.status !== "ok") {
    return {
      ready: false,
      note: cp?.note || "Spending numbers were not available for this check-in.",
    };
  }
  const used = Number(cp.budgetUsedPct) || 0;
  const under = Boolean(cp.underBudget);
  const delta = cp.momDeltaUsd;
  let trendPlain = "Similar to the month before.";
  if (delta != null) {
    const abs = Math.abs(Number(delta));
    if (abs < 0.5) trendPlain = "About the same as the month before.";
    else if (delta > 0) trendPlain = `Up about ${money(abs)} from the month before.`;
    else trendPlain = `Down about ${money(abs)} from the month before.`;
  }
  return {
    ready: true,
    lastLabel: cp.lastMonthLabel || "last month",
    lastUsd: Number(cp.lastMonthUsd),
    priorLabel: cp.priorMonthLabel,
    priorUsd: cp.priorMonthUsd == null ? null : Number(cp.priorMonthUsd),
    budgetUsd,
    usedPct: used,
    under,
    barPct: Math.max(0, Math.min(100, used)),
    tone: under ? statusTone("met") : statusTone("missed"),
    trendPlain,
  };
}

function attentionItems(evaluation, spend) {
  const items = [];
  for (const s of evaluation.committedSlos || []) {
    const st = String(s.status || "").toLowerCase();
    if (st === "missed" || st === "watch") {
      const copy = SLO_COPY[s.id] || { title: s.name, blurb: s.name };
      items.push(`${copy.title}: ${friendlySloNote(s)}`);
    }
  }
  if (spend.ready && !spend.under) {
    items.push(`Hosting spend was over the $${spend.budgetUsd} monthly budget.`);
  }
  if (!spend.ready) {
    items.push("Hosting spend could not be checked this month.");
  }
  return items;
}

function buildBody(evaluation) {
  const overall = weightedOverall(evaluation.dimensions || []);
  const target = evaluation.targetOverall ?? 3.8;
  const stamp = (evaluation.lastReviewed || "").slice(0, 7) || "unknown";
  const monthName = formatMonthLabel(evaluation.lastReviewed);
  const repo =
    envTrim("SCORECARD_REPO_URL") ||
    "https://github.com/jefftindall/broadway-portfolio";
  const scorecardUrl = `${repo}/blob/main/docs/ops/operational-excellence-scorecard.md`;
  const tone = overallTone(overall, target);
  const budgetUsd = evaluation.costProbe?.budgetUsd ?? BUDGET_USD;
  const spend = spendSummary(evaluation.costProbe, budgetUsd);
  const attention = attentionItems(evaluation, spend);
  const slos = evaluation.committedSlos || [];

  const plainLines = [];
  plainLines.push(`ElyseTindall.com — monthly check-in (${monthName})`);
  plainLines.push("");
  plainLines.push(tone.headline);
  plainLines.push(tone.detail);
  plainLines.push("");
  plainLines.push("Hosting cost");
  if (spend.ready) {
    plainLines.push(
      `  Last month (${spend.lastLabel}): ${money(spend.lastUsd)} of $${spend.budgetUsd} budget (${spend.usedPct}%)`,
    );
    plainLines.push(`  ${spend.under ? "Under budget — good." : "Over budget — please review with Jeff."}`);
    plainLines.push(`  ${spend.trendPlain}`);
  } else {
    plainLines.push(`  ${spend.note}`);
  }
  plainLines.push("");
  plainLines.push("How the site is doing for visitors");
  for (const s of slos) {
    const copy = SLO_COPY[s.id] || { title: s.name, blurb: s.name };
    const st = statusTone(s.status);
    plainLines.push(`  • ${copy.title}: ${st.label} — ${friendlySloNote(s)}`);
  }
  if (attention.length) {
    plainLines.push("");
    plainLines.push("Worth a glance");
    for (const a of attention) plainLines.push(`  • ${a}`);
  } else {
    plainLines.push("");
    plainLines.push("Nothing needs your attention this month.");
  }
  plainLines.push("");
  plainLines.push(`Full technical scorecard (for Jeff): ${scorecardUrl}`);
  plainLines.push("");
  plainLines.push(
    "This email shares health scores and dollar amounts only — never passwords or private contact details.",
  );

  const plainText = plainLines.join("\n");
  const html = renderHtml({
    monthName,
    tone,
    overall,
    target,
    spend,
    slos,
    attention,
    scorecardUrl,
  });

  return { stamp, monthName, plainText, html };
}

function renderHtml({ monthName, tone, overall, target, spend, slos, attention, scorecardUrl }) {
  const sloRows = slos
    .map((s) => {
      const copy = SLO_COPY[s.id] || { title: s.name, blurb: s.name };
      const st = statusTone(s.status);
      return `
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid ${COLORS.line};vertical-align:top;">
            <div style="font-size:16px;font-weight:600;color:${COLORS.ink};">${escapeHtml(copy.title)}</div>
            <div style="font-size:13px;color:${COLORS.muted};margin-top:2px;">${escapeHtml(copy.blurb)}</div>
          </td>
          <td style="padding:14px 16px;border-bottom:1px solid ${COLORS.line};vertical-align:top;width:42%;">
            <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;background:${st.bg};color:${st.fg};">${escapeHtml(st.label)}</span>
            <div style="font-size:13px;color:${COLORS.muted};margin-top:8px;line-height:1.4;">${escapeHtml(friendlySloNote(s))}</div>
          </td>
        </tr>`;
    })
    .join("");

  const attentionHtml =
    attention.length === 0
      ? `<p style="margin:0;font-size:15px;color:${COLORS.goodFg};">Nothing needs your attention this month.</p>`
      : `<ul style="margin:0;padding-left:18px;color:${COLORS.ink};font-size:15px;line-height:1.55;">${attention
          .map((a) => `<li style="margin-bottom:6px;">${escapeHtml(a)}</li>`)
          .join("")}</ul>`;

  let spendHtml;
  if (spend.ready) {
    spendHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;">
        <tr>
          <td style="padding:0 0 8px 0;">
            <span style="font-size:28px;font-weight:700;color:${COLORS.ink};">${escapeHtml(money(spend.lastUsd))}</span>
            <span style="font-size:15px;color:${COLORS.muted};"> spent in ${escapeHtml(spend.lastLabel)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 10px 0;font-size:14px;color:${COLORS.muted};">
            of a $${spend.budgetUsd} monthly hosting budget
          </td>
        </tr>
        <tr>
          <td style="padding:0 0 12px 0;">
            <div style="background:${COLORS.line};border-radius:999px;height:10px;overflow:hidden;">
              <div style="background:${spend.tone.bar};width:${spend.barPct}%;height:10px;border-radius:999px;"></div>
            </div>
            <div style="font-size:12px;color:${COLORS.soft};margin-top:6px;">${spend.usedPct}% of budget used</div>
          </td>
        </tr>
        <tr>
          <td>
            <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;background:${spend.tone.bg};color:${spend.tone.fg};">${spend.under ? "Under budget" : "Over budget"}</span>
            <span style="font-size:13px;color:${COLORS.muted};margin-left:8px;">${escapeHtml(spend.trendPlain)}</span>
          </td>
        </tr>
      </table>`;
  } else {
    spendHtml = `<p style="margin:0;font-size:15px;color:${COLORS.muted};line-height:1.5;">${escapeHtml(spend.note)}</p>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Monthly site check-in</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.paper};color:${COLORS.ink};font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.paper};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.card};border:1px solid ${COLORS.line};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 20px 28px;border-bottom:3px solid ${COLORS.brand};">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.brand};font-weight:700;">Elyse Tindall</div>
              <h1 style="margin:10px 0 6px 0;font-size:26px;line-height:1.25;font-weight:700;color:${COLORS.ink};">Monthly site check-in</h1>
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:${COLORS.muted};">${escapeHtml(monthName)} · elysetindall.com</p>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 28px;background:${tone.bg};">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${tone.fg};">${escapeHtml(tone.label)}</div>
              <div style="font-size:22px;font-weight:700;color:${COLORS.ink};margin-top:6px;line-height:1.3;">${escapeHtml(tone.headline)}</div>
              <p style="margin:8px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;color:${COLORS.muted};line-height:1.5;">${escapeHtml(tone.detail)}</p>
              <p style="margin:10px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:${COLORS.soft};">Overall health ${overall.toFixed(1)} / 5 (goal ${target})</p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 28px 8px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              <h2 style="margin:0 0 12px 0;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.soft};font-weight:700;">Hosting cost</h2>
              ${spendHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              <h2 style="margin:0 0 4px 0;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.soft};font-weight:700;">For visitors &amp; casting</h2>
              <p style="margin:0 0 12px 0;font-size:14px;color:${COLORS.muted};">Quick read on whether the public site and Studio behaved as expected.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${COLORS.line};border-radius:10px;overflow:hidden;">
                ${sloRows}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              <h2 style="margin:0 0 12px 0;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.soft};font-weight:700;">Worth a glance</h2>
              ${attentionHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              <p style="margin:0 0 10px 0;font-size:14px;color:${COLORS.muted};line-height:1.5;">
                Jeff gets the full technical write-up if anything needs fixing. You can ignore the link below unless you are curious.
              </p>
              <a href="${escapeHtml(scorecardUrl)}" style="color:${COLORS.brand};font-size:13px;">Open the detailed scorecard</a>
              <p style="margin:18px 0 0 0;font-size:11px;color:${COLORS.soft};line-height:1.45;">
                This email shares health scores and dollar amounts only — never passwords or private contact details.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function main() {
  const preview = process.argv.includes("--preview");
  const previewOut = process.argv.find((a) => a.startsWith("--preview-file="))?.slice(
    "--preview-file=".length,
  );

  const evaluation = JSON.parse(readFileSync(EVAL_PATH, "utf8"));
  const { stamp, monthName, plainText, html } = buildBody(evaluation);

  if (preview || previewOut) {
    if (previewOut) {
      writeFileSync(previewOut, html, "utf8");
      console.log(`Wrote HTML preview to ${previewOut}`);
    } else {
      process.stdout.write(html);
    }
    console.error(`Preview ready for ${monthName} (${stamp}).`);
    return;
  }

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

  const client = new EmailClient(connectionString);
  const poller = await client.beginSend({
    senderAddress: sender,
    recipients: {
      to: recipients.map((address) => ({ address })),
    },
    content: {
      subject: `ElyseTindall.com monthly check-in · ${monthName}`,
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
    `Sent monthly site check-in for ${monthName} to ${recipients.length} recipient(s) (addresses not logged).`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
