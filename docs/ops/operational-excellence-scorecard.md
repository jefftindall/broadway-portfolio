# Operational excellence scorecard

Living reliability posture for the Elyse Tindall portfolio. Rubric, SLOs, and backlog live in [`docs/plans/operational-excellence.md`](../plans/operational-excellence.md). **Scores, evidence, and gaps only — never alert emails, phones, or secrets.**

| Field | Value |
|-------|-------|
| **Last reviewed** | 2026-08-08 |
| **Review source** | monthly-workflow (+ Azure SLI attempt) |
| **Weighted overall** | **4.0 / 5** |
| **Target overall** | ≥ 3.8 (after P1 alerting) |
| **Verdict** | Strong change safety and docs; P1–P3 alerting/SLIs landed (except optional vendor escalate-if-unacked). Score Studio + inquiry windows after traffic; CD DeployFailed pages critical AG after prod apply. |

## Dimensions

| Dimension | Weight | Score | Maturity | Evidence | Primary gap | SLI |
|-----------|--------|-------|----------|----------|-------------|-----|
| Change safety | 1.2 | 4.5 | Strong | PR lint → one artifact → staging smoke/journeys → prod | Prod reviewers optional; shared KV check warn-only | ok |
| Ops documentation | 1.0 | 4.8 | Strong | Deploy, observability, secrets, access, DNS, cutover, cost; incident-response stub (OPS-P3-005) | No full postmortem template (lean stub is enough at this scale) | ok |
| Security & access | 1.1 | 4.7 | Strong | Easy Auth, allowlist, OIDC, KV, Turnstile; prod + shared KV purge protection (OPS-P3-006; soft-delete remains 7d, immutable) | Staging KV purge protection off by design; soft-delete days fixed at create | ok |
| Secrets & config | 0.9 | 4.0 | Strong | Env + shared KV; sync workflow; rotate-secrets | Functions need explicit secret sync | ok |
| Observability | 1.2 | 4.2 | Strong | Per-env AI; Studio correlation + events; GA4 public; HomepageFcpMs; contact inquiry events + SLI docs | No Workbooks as code | ok |
| Test automation | 1.1 | 4.0 | Strong | Staging smoke + journeys; homepage + materials synthetics; soft lab FCP | No unit tests; Studio E2E OOS | ok |
| Cost & capacity | 0.7 | 3.5 | Solid | cost-and-quotas; AI caps | Manual budget/Gemini console alerts | ok |
| Alerting & on-call | 1.1 | 4.3 | Strong | KV ALERT-* → notify/critical/watch AGs; homepage+materials Sev1; DeployFailed Sev1 (OPS-P3-003); FCP Sev3 | Optional vendor escalate-if-unacked still OPS-P3-002; operator must keep ALERT-* real | ok |
| Resilience & DR | 0.9 | 2.0 | Thin | Git rollback; env isolation; East US 2 only | Single region; shared ACS/Turnstile coupling | ok |
| SLOs & error budget | 0.8 | 3.8 | Solid | Field/synthetic SLIs: Materials availability avg 100% over 12 probe(s) (target 99.8% / 7d). Homepage FCP p75 156ms over 32 sample(s) (target < 1500ms / 7d). | Windows need traffic before met/missed; inquiry not yet a committed SLO | ok: App Insights returned no availability datapoints for the last 7 days (Homepage). Materials availability avg 100% over 12 probe(s) (target 99.8% / 7d). Homepage FCP p75 156ms over 32 sample(s) (target < 1500ms / 7d). No Studio publish UI events in the last 28 days; SLO-2 left stale. No StudioPublishToProdDurationMs samples in the last 28 days; SLO-3 left stale. No inquiry events in the last 28 days (excluding bots/validation); left stale. |

## Committed SLOs (status this review)

| ID | SLO | Target | Status | Note |
|----|-----|--------|--------|------|
| SLO-1 | Homepage availability | 99.8% / 7d | stale | App Insights returned no availability datapoints for the last 7 days (Homepage). |
| SLO-4 | Materials availability | 99.8% / 7d | met | Materials availability avg 100% over 12 probe(s) (target 99.8% / 7d). |
| SLO-6 | Homepage FCP | p75 < 1.5s / 7d | met | Homepage FCP p75 156ms over 32 sample(s) (target < 1500ms / 7d). |
| SLO-2 | Studio publish success | 95% / 28d | stale | No Studio publish UI events in the last 28 days; SLO-2 left stale. |
| SLO-3 | Publish → live latency | p95 ≤ 20m / 28d | stale | No StudioPublishToProdDurationMs samples in the last 28 days; SLO-3 left stale. |

## Optional SLIs (not committed)

| ID | SLO | Target | Status | Note |
|----|-----|--------|--------|------|
| SLO-5 | Inquiry accept rate | 99% / 28d (optional) | stale | No inquiry events in the last 28 days (excluding bots/validation); left stale. |

## How this file is updated

1. Edit [`scorecard-evaluation.json`](./scorecard-evaluation.json) (scores / evidence / gaps).
2. Run `node scripts/ops-scorecard-refresh.mjs` (add `--monthly --azure` when Azure CLI is logged in for homepage/materials/FCP/Studio/inquiry SLIs).
3. Monthly GitHub Action (`.github/workflows/ops-scorecard-monthly.yml`) does the same on a schedule and commits to `main` via the Studio GitHub App (CD ignores scorecard-only pushes).
4. Spot-check the commit if scores move unexpectedly; optional SLIs stay `stale` until Azure probes have enough samples.

History: optional prior snapshots may live under `docs/ops/scorecard-history/` later — not required for Phase 0.
