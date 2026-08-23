/**
 * SLO-7 — API request success error budget (OPS-P6-002).
 *
 * Target: 99.9% over 7 days. Failure is a 5xx / timeout (resultCode 0 or empty),
 * not 4xx. A wall-clock minute is "bad" only when it has 2+ server errors so a
 * single stray 502 cannot consume budget. Deploy quiet windows are excluded in
 * the Kusto SLI (see observability.md), not here.
 *
 * Keep Terraform alert thresholds in infra/modules/portfolio/monitoring.tf in
 * sync with these constants.
 */

export const API_SLO_PCT = 99.9;
export const API_SLO_WINDOW_DAYS = 7;
export const API_SLO_WINDOW_MINUTES = API_SLO_WINDOW_DAYS * 24 * 60; // 10080
export const API_ERROR_BUDGET_7D_MINUTES =
  (1 - API_SLO_PCT / 100) * API_SLO_WINDOW_MINUTES; // 10.08

/** Azure scheduled-query max lookback is P2D; Sev2 uses this burn window. */
export const API_ALERT_WINDOW_DAYS = 2;
export const API_ERROR_BUDGET_2D_MINUTES =
  API_ERROR_BUDGET_7D_MINUTES * (API_ALERT_WINDOW_DAYS / API_SLO_WINDOW_DAYS);

/** Server errors in one minute required before that minute consumes budget. */
export const BAD_MINUTE_MIN_FAILURES = 2;

/**
 * Sev2 fires when 2d bad minutes are greater than this (3+ minutes).
 * Proportional 2d budget is ~2.88 minutes.
 */
export const ALERT_BAD_MINUTES_THRESHOLD = 2;

export const DEPLOY_QUIET_BEFORE_MIN = 15;
export const DEPLOY_QUIET_AFTER_MIN = 10;

export function minuteIsBad(serverErrors) {
  return Number(serverErrors) >= BAD_MINUTE_MIN_FAILURES;
}

export function availabilityPct(badMinutes, windowMinutes = API_SLO_WINDOW_MINUTES) {
  if (!windowMinutes) return 100;
  const bad = Math.max(0, Number(badMinutes) || 0);
  return 100 * (1 - bad / windowMinutes);
}

export function meetsApiSlo(badMinutes, windowMinutes = API_SLO_WINDOW_MINUTES) {
  return availabilityPct(badMinutes, windowMinutes) >= API_SLO_PCT;
}

export function alertFiresOnBadMinutes(badMinutes2d) {
  return Number(badMinutes2d) > ALERT_BAD_MINUTES_THRESHOLD;
}

/**
 * Kusto SLI used by the Sev2 scheduled query (Azure window_duration = P2D)
 * and the monthly scorecard probe (pass lookback, e.g. "7d").
 *
 * Excludes every DeployStarted/DeployCompleted quiet window in range, not only
 * the latest marker — required once the lookback is longer than one deploy.
 */
export function apiErrorBudgetKusto({ lookback } = {}) {
  const lookbackFilter = lookback
    ? `\n| where timestamp > ago(${lookback})`
    : "";
  return `
let quietMinutes =
  customEvents${lookbackFilter}
  | where name in ("DeployStarted", "DeployCompleted")
  | extend QuietStart = timestamp - ${DEPLOY_QUIET_BEFORE_MIN}m, QuietEnd = timestamp + ${DEPLOY_QUIET_AFTER_MIN}m
  | extend Minute = range(bin(QuietStart, 1m), bin(QuietEnd, 1m), 1m)
  | mv-expand Minute to typeof(datetime)
  | distinct Minute;
requests${lookbackFilter}
| extend isServerError = success == false and (toint(resultCode) >= 500 or resultCode == "0" or isempty(resultCode))
| extend Minute = bin(timestamp, 1m)
| join kind=leftanti quietMinutes on Minute
| summarize Failed = countif(isServerError) by Minute
| summarize BadMinutes = countif(Failed >= ${BAD_MINUTE_MIN_FAILURES})
| project BadMinutes
`.trim();
}
