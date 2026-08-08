# Operational excellence scorecard

Living reliability posture for the Elyse Tindall portfolio. Rubric, SLOs, and backlog live in [`docs/plans/operational-excellence.md`](../plans/operational-excellence.md). **Scores, evidence, and gaps only — never alert emails, phones, or secrets.**

| Field | Value |
|-------|-------|
| **Last reviewed** | 2026-08-08 |
| **Review source** | ops-p2 |
| **Weighted overall** | **3.9 / 5** |
| **Target overall** | ≥ 3.8 (after P1 alerting) |
| **Verdict** | Strong change safety and docs; P1 Action Groups + P2 materials synthetics and field/lab FCP landed. Score weekly SLIs after prod apply and traffic accumulate; Studio cadence remains OPS-P3. |

## Dimensions

| Dimension | Weight | Score | Maturity | Evidence | Primary gap | SLI |
|-----------|--------|-------|----------|----------|-------------|-----|
| Change safety | 1.2 | 4.5 | Strong | PR lint → one artifact → staging smoke/journeys → prod | Prod reviewers optional; shared KV check warn-only | ok |
| Ops documentation | 1.0 | 4.5 | Strong | Deploy, observability, secrets, access, DNS, cutover, cost; lab FCP policy documented | No incident-response playbook | ok |
| Security & access | 1.1 | 4.5 | Strong | Easy Auth, allowlist, OIDC, KV, Turnstile | KV purge protection off; soft-delete 7d | ok |
| Secrets & config | 0.9 | 4.0 | Strong | Env + shared KV; sync workflow; rotate-secrets | Functions need explicit secret sync | ok |
| Observability | 1.2 | 4.0 | Strong | Per-env AI; Studio correlation + events; GA4 public; HomepageFcpMs RUM | Thin contact events; no Workbooks as code | ok |
| Test automation | 1.1 | 4.0 | Strong | Staging smoke + journeys; homepage + materials synthetics; soft lab FCP | No unit tests; Studio E2E OOS | ok |
| Cost & capacity | 0.7 | 3.5 | Solid | cost-and-quotas; AI caps | Manual budget/Gemini console alerts | ok |
| Alerting & on-call | 1.1 | 4.0 | Strong | KV ALERT-* → notify/critical/watch AGs; homepage+materials Sev1; FCP Sev3 email; failed-request→notify | Operator must set ALERT-* and confirm Portal test receipt; CD Sev1 / vendor escalate still OPS-P3 | ok |
| Resilience & DR | 0.9 | 2.0 | Thin | Git rollback; env isolation; East US 2 only | Single region; shared ACS/Turnstile coupling | ok |
| SLOs & error budget | 0.8 | 3.0 | Solid | Homepage + materials synthetics + HomepageFcpMs instrumented; monthly Azure probe can score them | Weekly/monthly windows need apply + traffic before met/missed; Studio SLO cadence OPS-P3-001 | stale: P2 instrumentation landed; score after prod terraform apply and field samples accumulate. |

## Committed SLOs (status this review)

| ID | SLO | Target | Status | Note |
|----|-----|--------|--------|------|
| SLO-1 | Homepage availability | 99.8% / 7d | instrumented | Prod web test exists; monthly --azure scores into overall |
| SLO-4 | Materials availability | 99.8% / 7d | instrumented | Resume + headshot prod web tests (OPS-P2-001); score after apply |
| SLO-6 | Homepage FCP | p75 < 1.5s / 7d | instrumented | HomepageFcpMs RUM + Sev3 watch alert (OPS-P2-002); needs ≥10 samples |
| SLO-2 | Studio publish success | 95% / 28d | instrumented | Events exist; cadence in OPS-P3-001 |
| SLO-3 | Publish → live latency | p95 ≤ 20m / 28d | instrumented | Metric exists; cadence in OPS-P3-001 |

## How this file is updated

1. Edit [`scorecard-evaluation.json`](./scorecard-evaluation.json) (scores / evidence / gaps).
2. Run `node scripts/ops-scorecard-refresh.mjs` (add `--monthly --azure` when Azure CLI is logged in for homepage/materials/FCP SLIs).
3. Monthly GitHub Action (`.github/workflows/ops-scorecard-monthly.yml`) does the same on a schedule and opens a PR titled `OPS: monthly operational excellence scorecard`.
4. Do not auto-merge that PR; humans review score changes.

History: optional prior snapshots may live under `docs/ops/scorecard-history/` later — not required for Phase 0.
