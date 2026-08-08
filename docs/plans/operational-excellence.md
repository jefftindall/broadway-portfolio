# Plan: Operational excellence

**Artifact ID:** `ELYSE-OPS-001`  
**Version:** 2.0  
**Last updated:** 2026-08-08  
**Audience:** Agents, implementers, operators  
**Scope:** Reliability posture scorecard, committed SLOs, critical alerting (SMS/voice), and a monthly refresh loop that keeps the scorecard current in `/docs`. Calibrated for a lean personal portfolio — not enterprise multi-team SRE.

Use the **Action ID** column (`OPS-*`) to reference items in PRs, issues, and commits.

**Status values:** `planned` · `in_progress` · `blocked` · `done` · `wont_fix`

**Implementation stance:** This document is the backlog. Prefer **one phase (or one `OPS-*` item) per PR**. Phase 0–3 (except optional `OPS-P3-002` PagerDuty) and Phase 4 (`OPS-P4-001` / `OPS-P4-002`) are complete. Do **not** implement PagerDuty escalate-if-unacked (`OPS-P3-002`) until explicitly requested.

---

## Privacy rule (non-negotiable)

Private operator contacts must **never** live in the git repo:

| Do not commit | Store instead |
|---------------|---------------|
| On-call / alert email addresses | Key Vault secrets (read at `terraform apply`) |
| Support / SMS / voice phone numbers | Key Vault secrets (read at `terraform apply`) |
| PagerDuty / Better Stack routing keys | Key Vault secrets (or GitHub Environment secrets), not source |
| Real values in `*.tfvars`, docs, canvases, PR bodies, or examples | Placeholders only (`REPLACE_ME`, `<email>`, `+1XXXXXXXXXX`) |

**Pattern:** Placeholder secrets with `lifecycle { ignore_changes = [value] }`, set via `az keyvault secret set`, Terraform data sources at apply — same as [`infra/bootstrap/shared_kv.tf`](../../infra/bootstrap/shared_kv.tf) and [`docs/runbooks/rotate-secrets.md`](../runbooks/rotate-secrets.md).

**Today’s gap:** ~~`alert_email` plaintext TF variable~~ — **resolved in Phase 1.** Contacts are Key Vault `ALERT-*` only.

**Separate from contact-form notify:** `SITE-CONTACT-*` in `kv-elyse-shared` are for ACS inquiry delivery. Ops alert contacts use dedicated `ALERT-*` secrets in the **same shared vault** (`kv-elyse-shared`, bootstrap) so staging and prod Action Groups share one on-call contact set.

The **persisted scorecard** in `/docs` must also omit private emails/phones — scores, evidence, and gaps only.

---

## How to use this document

| Section | Purpose |
|---------|---------|
| [Scorecard](#operational-excellence-scorecard) | Dimensions, rubric, baseline, persistence + monthly refresh |
| [Committed SLOs](#committed-slos) | Targets we intend to hold |
| [Severity model](#severity--channel-model) | What pages vs emails |
| [Critical alerting](#critical-alerting-plan) | SMS + phone beyond email |
| [Phased backlog](#phased-backlog) | Implementable `OPS-*` work |
| [Out of scope](#out-of-scope) | Explicit non-goals |

---

## Operational excellence scorecard

### Rubric (1–5)

Scored against a **lean personal-portfolio** bar (not bank-grade).

| Band | Score | Meaning |
|------|-------|---------|
| **Strong** | 4.0–5.0 | Production-grade for this scale; residual gaps are polish |
| **Solid** | 3.0–3.9 | Works in practice; known backlog or uneven coverage |
| **Thin** | 2.0–2.9 | Mechanism exists or is partial; not reliable under stress |
| **Gap** | 1.0–1.9 | Absent or only implicit |

**Weighted overall** favors change safety, observability, testing, and alerting. Target overall **≥ 3.8** after P1 alerting lands; keep change safety **≥ 4.5**.

### Dimensions

| ID | Dimension | Weight | What “good” looks like |
|----|-----------|--------|------------------------|
| `change` | Change safety | 1.2 | Staging + smoke/journeys + same artifact to prod; infra plan on PR |
| `docs` | Ops documentation | 1.0 | Runbooks for deploy, access, secrets, observability, DNS |
| `security` | Security & access | 1.1 | Easy Auth + allowlist, OIDC, KV SoT, Turnstile |
| `secrets` | Secrets & config | 0.9 | Vault SoT + sync; no secrets in git |
| `obs` | Observability | 1.2 | App Insights + correlation IDs; public + Studio signals |
| `testing` | Test automation | 1.1 | Smoke + journeys; synthetics for SLO paths |
| `cost` | Cost & capacity | 0.7 | Budgets/caps documented; quota awareness |
| `alerting` | Alerting & on-call | 1.1 | Sev1 SMS/voice; KV-backed contacts; severity table |
| `dr` | Resilience & DR | 0.9 | Env isolation; git rollback; honest single-region limits |
| `slo` | SLOs & error budget | 0.8 | Written SLOs + weekly/monthly scoring |

### Baseline snapshot (2026-08-08)

Initial SRE review — **not yet** the monthly persisted artifact (see [Scorecard persistence](#scorecard-persistence--monthly-refresh)).

| Dimension | Score | Maturity | Evidence (summary) | Primary gap |
|-----------|-------|----------|--------------------|-------------|
| Change safety | 4.5 | Strong | PR lint → one artifact → staging smoke/journeys → prod | Prod reviewers optional; shared KV check warn-only |
| Ops documentation | 4.5 | Strong | Deploy, observability, secrets, access, DNS, cutover, cost | No incident-response playbook |
| Security & access | 4.5 | Strong | Easy Auth, allowlist, OIDC, KV, Turnstile | KV purge protection off; soft-delete 7d |
| Secrets & config | 4.0 | Strong | Env + shared KV; sync workflow; rotate-secrets | Functions need explicit secret sync |
| Observability | 3.8 | Solid | Per-env AI; Studio correlation + events; GA4 public | Thin contact events; no Workbooks as code |
| Test automation | 3.5 | Solid | Staging smoke + journeys; homepage synthetic | No unit tests; materials synth; Studio E2E OOS |
| Cost & capacity | 3.5 | Solid | cost-and-quotas; AI caps | Manual budget/Gemini console alerts |
| Alerting & on-call | 2.0 | Thin | TF alerts if `alert_email` set | Empty default; no SMS/voice → **P1 closed:** KV `ALERT-*` + notify/critical AGs |
| Resilience & DR | 2.0 | Thin | Git rollback; env isolation; East US 2 only | Single region; shared ACS/Turnstile coupling |
| SLOs & error budget | 1.5 | Gap | Implicit homepage ping | Written SLOs not scored yet |

**Baseline weighted overall:** ~**3.5 / 5** (B+). Verdict: strong change safety and docs; thin detect-and-respond. Living copy: [`docs/ops/operational-excellence-scorecard.md`](../ops/operational-excellence-scorecard.md).

### Scorecard persistence + monthly refresh

| Artifact | Path | Role |
|----------|------|------|
| **Persisted scorecard** | [`docs/ops/operational-excellence-scorecard.md`](../ops/operational-excellence-scorecard.md) | Living scores, evidence, gaps, overall, last reviewed date |
| **Evaluation JSON** | [`docs/ops/scorecard-evaluation.json`](../ops/scorecard-evaluation.json) | Machine-editable scores; regenerated into the markdown by `scripts/ops-scorecard-refresh.mjs` |
| **This plan** | `docs/plans/operational-excellence.md` | Rubric, SLO/alerting backlog, workflow contract — not the monthly scores |
| **History (optional)** | `docs/ops/scorecard-history/` or appendix in the scorecard | Prior month snapshots if useful |

**Monthly workflow** (`.github/workflows/ops-scorecard-monthly.yml`):

1. **Trigger:** GitHub Actions `schedule` (`0 14 1 * *` — 1st of month 14:00 UTC) + `workflow_dispatch`.
2. **Job:** `environment: prod` (TF OIDC subject). Azure login is required. Mint a Studio GitHub App installation token via [`scripts/mint-github-app-token.sh`](../../scripts/mint-github-app-token.sh) (PEM line-masked; never via action `with:`), verify Contents:write + `/installation/repositories`, configure git with the installation token (`persist-credentials: false` on checkout), then `node scripts/ops-scorecard-refresh.mjs --monthly --azure` (SLIs + Cost Management spend/MoM).
3. **Privacy:** Workflow must **never** write alert emails, phones, App PEMs, or secrets into the scorecard or logs. CI enforces this with `npm run lint:actions-secrets` / **Actions secret-safety**. Digest body is scores + USD only (no recipient addresses).
4. **Output:** Commit and push scorecard files directly to `main` as `elyse-portfolio-studio[bot]` (App is a **Protect main** bypass actor — same as Studio publishes). Do **not** open a PR. Do **not** push with the job `GITHUB_TOKEN` (`github-actions[bot]`). Do **not** trust `GET /repos` `.permissions.push` for installation tokens (often all-false).
5. **CD:** Scorecard-only pushes are excluded from [`azure-static-web-apps.yml`](../../.github/workflows/azure-static-web-apps.yml) via `paths-ignore` on the two scorecard artifacts.
6. **Failure:** If Azure SLI/spend queries fail after login, still refresh qualitative dimensions and mark SLI-backed rows `stale` with a note. If Azure login or App token minting fails, the job fails (no silent `GITHUB_TOKEN` fallback).
7. **Spend (`OPS-P4-002`):** Cost Management ActualCost for the previous calendar month vs the month before; vs subscription budget **ceil(expected retail × 1.25)** (`OPS-P4-001`; amount in `cost-and-quotas.md` / `budget.tf`). Persist in evaluation `costProbe` and the scorecard Cost section.
8. **Digest (`OPS-P4-002`):** After refresh (even if no git diff), fetch ACS + recipients from `kv-elyse-shared` and send ACS email via [`scripts/ops-scorecard-email.mjs`](../../scripts/ops-scorecard-email.mjs) to `ALERT-EMAIL` and `SITE-CONTACT-EMAIL` (dedupe; skip if both `REPLACE_ME`). ACS **email** only — not ACS SMS.

---

## Committed SLOs

| ID | SLO | Target | SLI (intended) | Instrumentation today |
|----|-----|--------|----------------|------------------------|
| **SLO-1** | Homepage availability | **99.8% over 7 days** | App Insights homepage web test success | Measurable (prod web test exists) |
| **SLO-4** | Materials availability | **99.8% over 7 days** | Synthetic GET resume PDF + theatrical headshot → 200 | Measurable (prod web tests) |
| **SLO-6** | Homepage FCP | **Field p75 &lt; 1.5 s over 7 days** | Browser `HomepageFcpMs` → App Insights | Measurable (force-sampled RUM) |
| **SLO-2** | Studio publish success | **95% over 28 days** (≥3 attempts) | `StudioPublishUiSuccess` / (Success+Failed); exclude allowlist denials | Measurable |
| **SLO-3** | Publish → live latency | **p95 ≤ 20 minutes over 28 days** | `StudioPublishToProdDurationMs` | Measurable |

**Error budget (availability):** 99.8% / 7d ≈ **20 minutes** / week (~≤2 failed 10-minute probes). Page on the first Sev1 window; use the weekly % as the scorecard input for `slo` / `alerting`.

**Process invariant (not an SLO):** 100% of production site deploys reuse a staging-verified artifact after green smoke (and journeys when required).

**Next (not committed):** Promote inquiry accept rate **99% / 28d** from optional SLI to committed after steady volume (`OPS-P3-004` instrumentation done).

---

## Severity → channel model

| Severity | Examples | Channels | Ack expectation |
|----------|----------|----------|-----------------|
| **Sev1 — critical** | Homepage or materials availability fail; Deploy Production failed leaving prod broken | Email + SMS immediately; native voice on critical AG (Phase 1); optional vendor escalate-if-unacked (`OPS-P3-002`) | Respond / silence within 15 min |
| **Sev2 — urgent** | Failed-request spike; Studio publish failures ≥2 / 24h | Email + SMS (no voice) | Same day |
| **Sev3 — watch** | FCP p75 burn; error-budget Watch state | Email only (`ag-elyse-watch-*`) | Next working session |

---

## Critical alerting plan

### Phase 1 — Azure Monitor native (`done`)

1. Shared Key Vault (`kv-elyse-shared`): `ALERT-EMAIL`, `ALERT-SMS-PHONE`, optional `ALERT-VOICE-PHONE` (placeholders in bootstrap TF; real values via CLI only).
2. Action Groups: `ag-elyse-notify-{env}` (email ± SMS), `ag-elyse-critical-{env}` (email + SMS + voice).
3. Homepage availability → **critical**; failed-request → **notify**.
4. Prove-out: Portal **Test action group** on `ag-elyse-critical-prod` + optional threshold exercise — procedure in [rotate-secrets.md](../runbooks/rotate-secrets.md) (no PII in git).

### Phase 2 — Materials + FCP SLIs (`done`)

1. Prod web tests: resume PDF + theatrical headshot → same critical Action Group as homepage (`OPS-P2-001`).
2. Field FCP: browser paint timing → `HomepageFcpMs` custom metric (force-sampled on `/`); Sev3 email via `ag-elyse-watch-*` when **2d** p75 &gt; 1.5s with ≥10 samples (Azure scheduled-query max lookback). Committed **SLO-6** remains **7d** and is scored by the monthly scorecard Kusto probe (`OPS-P2-002`).
3. Soft lab FCP gate on staging: `npm run test:lab-fcp` (median &lt; 1.5s policy; `LAB_FCP_HARD=1` for hard fail) (`OPS-P2-003`).

### Phase 3 — Escalate-if-unacked phone (`OPS-P3-002` only still planned)

1. Webhook → PagerDuty / Better Stack / Opsgenie.
2. SMS → voice if unacked in **5 minutes**.
3. Routing keys only in Key Vault or GitHub Environment secrets.
4. Prefer disabling simultaneous native Azure voice once the vendor owns escalation.

Studio SLO cadence, CD Sev1 `DeployFailed`, inquiry SLI docs, IR stub, and prod/shared KV purge protection are **done** (see backlog table).

### Non-goal

Do **not** send ops alerts through ACS contact-form SMS (`ACS-SMS-FROM` + `SITE-CONTACT-PHONE`).

---

## Phased backlog

### Phase 0 — Plan, scorecard contract, secrets naming

| Action ID | Work | Acceptance criteria | Status |
|-----------|------|---------------------|--------|
| `OPS-P0-001` | Operational excellence plan + agent rule; privacy (no contacts in git) | Plan + AGENTS + cursor rule; no real contacts in repo | `done` |
| `OPS-P0-002` | Define `ALERT-*` secret names + bootstrap placeholders in `kv-elyse-shared` | Runbook lists names/set commands; TF creates `REPLACE_ME` secrets; no real values | `done` |
| `OPS-P0-003` | Persist initial scorecard under `docs/ops/operational-excellence-scorecard.md` | File exists; baseline scores copied from this plan; no private contacts | `done` |
| `OPS-P0-004` | Monthly GitHub Actions workflow to re-evaluate scorecard + commit to `main` | `schedule` + `workflow_dispatch`; updates scorecard doc; Studio GitHub App push to `main`; CD `paths-ignore` for scorecard-only commits | `done` |

### Phase 1 — Key Vault–backed email + SMS + voice

| Action ID | Work | Acceptance criteria | Status |
|-----------|------|---------------------|--------|
| `OPS-P1-001` | Replace `alert_email` TF variable with data source from shared `ALERT-EMAIL` | No email in tfvars/examples; skip receivers when `REPLACE_ME` | `done` |
| `OPS-P1-002` | Add shared `ALERT-SMS-PHONE` (+ voice) on critical/notify groups | SMS/voice on Action Group test; numbers only in Key Vault | `done` |
| `OPS-P1-003` | Confirm prod homepage Sev1 → critical group | Controlled test documents receipt (without committing PII) | `done` |

### Phase 2 — Materials + FCP SLIs

| Action ID | Work | Acceptance criteria | Status |
|-----------|------|---------------------|--------|
| `OPS-P2-001` | Prod web tests for resume PDF + headshot | 99.8%/7d scoring; Sev1 → critical | `done` |
| `OPS-P2-002` | Field FCP p75 for `/` (web-vitals/paint → App Insights) | Weekly score vs 1.5s; Sev3 email only when burned | `done` |
| `OPS-P2-003` | Optional lab FCP gate on staging | Documents median FCP &lt; 1.5s policy (soft default; hard via env) | `done` |

### Phase 3 — Studio scorecards, escalation product, hardening

| Action ID | Work | Acceptance criteria | Status |
|-----------|------|---------------------|--------|
| `OPS-P3-001` | Kusto + cadence for SLO-2 / SLO-3 in observability runbook | Queries documented; monthly scorecard can cite them | `done` |
| `OPS-P3-002` | Optional PagerDuty/Better Stack + 5-minute escalate | Routing key in vault/GH secrets; mobile ack works | `planned` |
| `OPS-P3-003` | Deploy Production failure → Sev1 path | CD break pages SMS (and Phase 1 voice policy) | `done` |
| `OPS-P3-004` | Inquiry accept-rate SLO (optional) | Contact 5xx SLI excluding Turnstile bots | `done` |
| `OPS-P3-005` | Short incident severity + response stub runbook | Links severity table; no private phones in doc | `done` |
| `OPS-P3-006` | Prod KV purge protection (optional harden) | Documented decision + TF if accepted | `done` |

### Phase 4 — Subscription budget + monthly digest

| Action ID | Work | Acceptance criteria | Status |
|-----------|------|---------------------|--------|
| `OPS-P4-001` | Subscription Azure Budget = **ceil(expected retail × 1.25)** in bootstrap | `budget-elyse-portfolio-monthly`; keep `cost-and-quotas.md` breakdown current; **80%**/100% Actual → `ALERT-EMAIL` (Owners fallback if REPLACE_ME) | `done` |
| `OPS-P4-002` | Monthly scorecard ACS digest + Cost Management spend/MoM | Digests to `ALERT-EMAIL` + `SITE-CONTACT-EMAIL`; body scores + USD only; spend in scorecard `costProbe` | `done` |

---

## Dependency graph

```text
OPS-P0-001 (this plan / AI guidance) [done]
    ├── OPS-P0-002 (ALERT-* in shared KV + rotate-secrets) [done]
    │       └── OPS-P1-001 (KV-backed email) [done]
    │               ├── OPS-P1-002 (SMS/voice) [done]
    │               │       └── OPS-P1-003 (homepage Sev1 prove-out) [done]
    │               │               ├── OPS-P2-001 (materials → critical) [done]
    │               │               └── OPS-P3-003 (CD failure → Sev1) [done]
    │               └── OPS-P2-002 / OPS-P2-003 (FCP) [done]
    ├── OPS-P0-003 (persist scorecard under docs/ops/) [done]
    │       └── OPS-P0-004 (monthly re-evaluate → App push to main) [done]
    │               └── OPS-P4-002 (ACS digest + spend/MoM) [done]
    ├── OPS-P3-001 / OPS-P3-005 (Studio cadence + IR stub) [done]
    ├── OPS-P3-004 (inquiry SLI) [done]
    ├── OPS-P3-006 (prod/shared KV purge protection) [done]
    └── OPS-P4-001 (subscription budget = ceil(expected×1.25); 80% alert) [done]
OPS-P3-002 (PagerDuty) — after OPS-P1-002 [done]; still planned
```
---

## Out of scope

- Multi-region active-passive / vanity 99.99% claims
- Authenticated Studio E2E in CI
- Using ACS inquiry SMS as the on-call channel
- Committing real emails, phones, or vendor API keys
- Putting `SITE-CONTACT-EMAIL` on Azure Budget threshold notifications (digest covers both)
- Full enterprise incident-management / paging product as a day-one requirement

---

## Related docs

| Doc | Role |
|-----|------|
| [observability.md](../runbooks/observability.md) | App Insights, Kusto; Action Groups via shared `ALERT-*`; Studio + inquiry SLO queries |
| [rotate-secrets.md](../runbooks/rotate-secrets.md) | Key Vault SoT; `ALERT-*` names + Sev1 prove-out; KV purge decision |
| [testing-strategy.md](../runbooks/testing-strategy.md) | Staging gates; smoke covers materials URLs |
| [deploy-and-rollback.md](../runbooks/deploy-and-rollback.md) | Change-safety evidence; Deploy Production Sev1 |
| [incident-response.md](../runbooks/incident-response.md) | Severity stub (`OPS-P3-005`) |
| [cost-and-quotas.md](../runbooks/cost-and-quotas.md) | Retail expected breakdown + budget ceil(expected×1.25) (`OPS-P4-001`); Gemini console residual |
| [monthly-site-check-in.md](../runbooks/monthly-site-check-in.md) | How Elyse reads the monthly ACS digest; annotated email; what is actionable (`OPS-P4-002`) |
| [github-app.md](../runbooks/github-app.md) | Studio App Contents:write + Protect main bypass (scorecard monthly push) |
| [search-and-analytics.md](search-and-analytics.md) | GA4/GSC — not ops paging |
| `docs/ops/operational-excellence-scorecard.md` | Living scorecard (`OPS-P0-003` done; refreshed by `OPS-P0-004`; digest `OPS-P4-002`) |
