# Operational excellence scorecard

Living reliability posture for the Elyse Tindall portfolio. Rubric, SLOs, and backlog live in [`docs/plans/operational-excellence.md`](../plans/operational-excellence.md). **Scores, evidence, and gaps only — never alert emails, phones, or secrets.**

| Field | Value |
|-------|-------|
| **Last reviewed** | 2026-08-08 |
| **Review source** | ops-p3 |
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
| SLOs & error budget | 0.8 | 3.8 | Solid | Homepage + materials + FCP + Studio SLO-2/3 monthly probes (OPS-P3-001); optional inquiry SLI (OPS-P3-004) | Windows need traffic before met/missed; inquiry not yet a committed SLO | stale: P3 probes landed; score with --azure after prod apply and Studio/inquiry volume. |

## Committed SLOs (status this review)

| ID | SLO | Target | Status | Note |
|----|-----|--------|--------|------|
| SLO-1 | Homepage availability | 99.8% / 7d | instrumented | Prod web test exists; monthly --azure scores into overall |
| SLO-4 | Materials availability | 99.8% / 7d | instrumented | Resume + headshot prod web tests (OPS-P2-001); score after apply |
| SLO-6 | Homepage FCP | p75 < 1.5s / 7d | instrumented | HomepageFcpMs RUM + Sev3 watch alert (OPS-P2-002); needs ≥10 samples |
| SLO-2 | Studio publish success | 95% / 28d | instrumented | Kusto + monthly --azure probe (OPS-P3-001); ≥3 attempts |
| SLO-3 | Publish → live latency | p95 ≤ 20m / 28d | instrumented | Kusto + monthly --azure probe (OPS-P3-001) |

## Optional SLIs (not committed)

| ID | SLO | Target | Status | Note |
|----|-----|--------|--------|------|
| SLO-5 | Inquiry accept rate | 99% / 28d (optional) | instrumented | ContactInquiry* SLI excludes turnstile_rejected + validation (OPS-P3-004); promote to committed when volume is steady |

## How this file is updated

1. Edit [`scorecard-evaluation.json`](./scorecard-evaluation.json) (scores / evidence / gaps).
2. Run `node scripts/ops-scorecard-refresh.mjs` (add `--monthly --azure` when Azure CLI is logged in for homepage/materials/FCP/Studio/inquiry SLIs).
3. Monthly GitHub Action (`.github/workflows/ops-scorecard-monthly.yml`) does the same on a schedule and opens a PR titled `OPS: monthly operational excellence scorecard`.
4. Do not auto-merge that PR; humans review score changes.

History: optional prior snapshots may live under `docs/ops/scorecard-history/` later — not required for Phase 0.
