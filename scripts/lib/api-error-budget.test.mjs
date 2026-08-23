import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ALERT_BAD_MINUTES_THRESHOLD,
  API_ERROR_BUDGET_2D_MINUTES,
  API_ERROR_BUDGET_7D_MINUTES,
  API_SLO_PCT,
  API_SLO_WINDOW_MINUTES,
  BAD_MINUTE_MIN_FAILURES,
  DEPLOY_QUIET_AFTER_MIN,
  DEPLOY_QUIET_BEFORE_MIN,
  alertFiresOnBadMinutes,
  apiErrorBudgetKusto,
  availabilityPct,
  meetsApiSlo,
  minuteIsBad,
} from "./api-error-budget.mjs";

test("99.9% / 7d budget is about 10 minutes", () => {
  assert.equal(API_SLO_WINDOW_MINUTES, 10080);
  assert.ok(Math.abs(API_ERROR_BUDGET_7D_MINUTES - 10.08) < 1e-9);
  assert.ok(Math.abs(API_ERROR_BUDGET_2D_MINUTES - 10.08 * (2 / 7)) < 1e-9);
});

test("a single server error does not make a minute bad", () => {
  assert.equal(minuteIsBad(0), false);
  assert.equal(minuteIsBad(1), false);
  assert.equal(minuteIsBad(2), true);
  assert.equal(minuteIsBad(5), true);
});

test("10 bad minutes in 7d still meets 99.9%; 11 misses", () => {
  assert.ok(meetsApiSlo(10));
  assert.equal(meetsApiSlo(11), false);
  assert.ok(availabilityPct(0) === 100);
  assert.ok(availabilityPct(10) >= API_SLO_PCT);
  assert.ok(availabilityPct(11) < API_SLO_PCT);
});

test("Sev2 does not fire on 0–2 bad minutes in the 2d window", () => {
  assert.ok(API_ERROR_BUDGET_2D_MINUTES > ALERT_BAD_MINUTES_THRESHOLD);
  assert.equal(alertFiresOnBadMinutes(0), false);
  assert.equal(alertFiresOnBadMinutes(1), false);
  assert.equal(alertFiresOnBadMinutes(2), false);
  assert.equal(alertFiresOnBadMinutes(3), true);
});

function collapseWs(s) {
  return String(s).replace(/\s+/g, " ").trim();
}

test("Kusto SLI excludes every deploy quiet window and counts 2+ 5xx minutes", () => {
  const alertQuery = apiErrorBudgetKusto();
  const scorecardQuery = apiErrorBudgetKusto({ lookback: "7d" });
  assert.match(alertQuery, /join kind=leftanti quietMinutes/);
  assert.match(alertQuery, new RegExp(`timestamp - ${DEPLOY_QUIET_BEFORE_MIN}m`));
  assert.match(alertQuery, new RegExp(`timestamp \\+ ${DEPLOY_QUIET_AFTER_MIN}m`));
  assert.match(alertQuery, new RegExp(`Failed >= ${BAD_MINUTE_MIN_FAILURES}`));
  assert.doesNotMatch(alertQuery, /ago\(/);
  assert.match(scorecardQuery, /ago\(7d\)/);
  assert.equal((scorecardQuery.match(/ago\(7d\)/g) || []).length, 2);
});

test("Terraform Sev2 query stays in sync with apiErrorBudgetKusto()", () => {
  const tf = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../infra/modules/portfolio/monitoring.tf"),
    "utf8",
  );
  const match = tf.match(
    /resource "azurerm_monitor_scheduled_query_rules_alert_v2" "failed_requests"[\s\S]*?query\s*=\s*<<-QUERY\n([\s\S]*?)\n\s*QUERY/,
  );
  assert.ok(match, "failed_requests query heredoc not found in monitoring.tf");
  assert.equal(collapseWs(match[1]), collapseWs(apiErrorBudgetKusto()));
  assert.match(tf, /window_duration\s*=\s*"P2D"/);
  assert.match(tf, /threshold\s*=\s*2/);
});
