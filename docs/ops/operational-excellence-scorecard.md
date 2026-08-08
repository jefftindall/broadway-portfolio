# Operational excellence scorecard

Living reliability posture for the Elyse Tindall portfolio. Rubric, SLOs, and backlog live in [`docs/plans/operational-excellence.md`](../plans/operational-excellence.md). **Scores, evidence, and gaps only — never alert emails, phones, or secrets.**

| Field | Value |
|-------|-------|
| **Last reviewed** | 2026-08-08 |
| **Review source** | ops-p1 |
| **Weighted overall** | **3.6 / 5** |
| **Target overall** | ≥ 3.8 (after P1 alerting) |
| **Verdict** | Strong change safety and docs; P1 Action Groups landed — set ALERT-* and prove Sev1 receipt to harden detect-and-respond. |

## Dimensions

| Dimension | Weight | Score | Maturity | Evidence | Primary gap | SLI |
|-----------|--------|-------|----------|----------|-------------|-----|
| Change safety | 1.2 | 4.5 | Strong | PR lint → one artifact → staging smoke/journeys → prod | Prod reviewers optional; shared KV check warn-only | ok |
| Ops documentation | 1.0 | 4.5 | Strong | Deploy, observability, secrets, access, DNS, cutover, cost | No incident-response playbook | ok |
| Security & access | 1.1 | 4.5 | Strong | Easy Auth, allowlist, OIDC, KV, Turnstile | KV purge protection off; soft-delete 7d | ok |
| Secrets & config | 0.9 | 4.0 | Strong | Env + shared KV; sync workflow; rotate-secrets | Functions need explicit secret sync | ok |
| Observability | 1.2 | 3.8 | Solid | Per-env AI; Studio correlation + events; GA4 public | Thin contact events; no Workbooks as code | ok |
| Test automation | 1.1 | 3.5 | Solid | Staging smoke + journeys; homepage synthetic | No unit tests; materials synth; Studio E2E OOS | ok |
| Cost & capacity | 0.7 | 3.5 | Solid | cost-and-quotas; AI caps | Manual budget/Gemini console alerts | ok |
| Alerting & on-call | 1.1 | 3.8 | Solid | KV ALERT-* → ag-elyse-notify (email±SMS) + ag-elyse-critical (email+SMS+voice); homepage Sev1→critical; failed-request→notify | Operator must set ALERT-* (not REPLACE_ME) and confirm Portal test receipt; materials/CD Sev1 still OPS-P2/P3 | ok |
| Resilience & DR | 0.9 | 2.0 | Thin | Git rollback; env isolation; East US 2 only | Single region; shared ACS/Turnstile coupling | ok |
| SLOs & error budget | 0.8 | 1.5 | Gap | Implicit homepage ping; committed SLOs in plan | Written SLOs not scored yet against weekly/monthly windows | stale: Homepage availability SLI not queried this review (baseline). Materials/FCP/Studio SLIs need OPS-P2/P3. |

## Committed SLOs (status this review)

| ID | SLO | Target | Status | Note |
|----|-----|--------|--------|------|
| SLO-1 | Homepage availability | 99.8% / 7d | instrumented | Prod web test exists; not yet scored into monthly overall |
| SLO-4 | Materials availability | 99.8% / 7d | blocked | Needs prod web tests (OPS-P2-001) |
| SLO-6 | Homepage FCP | p75 < 1.5s / 7d | blocked | Needs field pipeline (OPS-P2-002) |
| SLO-2 | Studio publish success | 95% / 28d | instrumented | Events exist; cadence in OPS-P3-001 |
| SLO-3 | Publish → live latency | p95 ≤ 20m / 28d | instrumented | Metric exists; cadence in OPS-P3-001 |

## How this file is updated

1. Edit [`scorecard-evaluation.json`](./scorecard-evaluation.json) (scores / evidence / gaps).
2. Run `node scripts/ops-scorecard-refresh.mjs` (add `--monthly --azure` when Azure CLI is logged in for homepage SLI).
3. Monthly GitHub Action (`.github/workflows/ops-scorecard-monthly.yml`) does the same on a schedule and opens a PR titled `OPS: monthly operational excellence scorecard`.
4. Do not auto-merge that PR; humans review score changes.

History: optional prior snapshots may live under `docs/ops/scorecard-history/` later — not required for Phase 0.
