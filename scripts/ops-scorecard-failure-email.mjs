#!/usr/bin/env node
/**
 * Email ALERT-EMAIL when the OPS monthly scorecard workflow fails.
 * ACS email only — never SITE-CONTACT-EMAIL, never logs recipient addresses.
 *
 * Env:
 *   ACS_CONNECTION_STRING, ACS_EMAIL_SENDER (required to send)
 *   ALERT_EMAIL (optional; skip if empty/REPLACE_ME)
 *   RUN_URL (workflow run link)
 *   WORKFLOW_NAME (optional label)
 */
import { EmailClient } from "@azure/communication-email";

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

async function main() {
  const connectionString = envTrim("ACS_CONNECTION_STRING");
  const sender = envTrim("ACS_EMAIL_SENDER");
  const alertEmail = envTrim("ALERT_EMAIL");
  const runUrl = envTrim("RUN_URL") || "(run URL unavailable)";
  const workflowName =
    envTrim("WORKFLOW_NAME") || "OPS monthly scorecard";

  if (!isConfiguredEmail(alertEmail)) {
    console.log(
      "ALERT-EMAIL not configured; skipping scorecard failure notify.",
    );
    return;
  }
  if (!connectionString || connectionString === "REPLACE_ME") {
    console.error("ACS_CONNECTION_STRING missing; cannot send failure notify.");
    process.exit(1);
  }
  if (!sender || sender === "REPLACE_ME") {
    console.error("ACS_EMAIL_SENDER missing; cannot send failure notify.");
    process.exit(1);
  }

  const subject = `${workflowName} FAILED`;
  const plainText = [
    `${workflowName} failed.`,
    "",
    "This is an automated ops notice (ALERT-EMAIL only).",
    "The monthly site check-in digest was not sent for this run.",
    "",
    `Open the workflow run: ${runUrl}`,
    "",
    "Do not reply with secrets. Fix the job, then re-run via workflow_dispatch if needed.",
  ].join("\n");

  const safeName = escapeHtml(workflowName);
  const safeUrl = escapeHtml(runUrl);
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1917;background:#fafaf9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;">
    <tr>
      <td style="padding:22px 28px;background:#fef2f2;border-bottom:1px solid #fecaca;">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#991b1b;">Needs attention</div>
        <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;">${safeName} failed</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;font-size:15px;line-height:1.55;color:#57534e;">
        <p style="margin:0 0 12px 0;">Automated ops notice for ALERT-EMAIL only. The monthly site check-in digest was not sent for this run.</p>
        <p style="margin:0 0 16px 0;"><a href="${safeUrl}" style="color:#9f1239;">Open the workflow run</a></p>
        <p style="margin:0;font-size:12px;color:#78716c;">Do not reply with secrets. Fix the job, then re-run via workflow_dispatch if needed.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const client = new EmailClient(connectionString);
  const poller = await client.beginSend({
    senderAddress: sender,
    recipients: {
      to: [{ address: alertEmail }],
    },
    content: {
      subject,
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
    "Sent scorecard workflow failure notice to ALERT-EMAIL (address not logged).",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
