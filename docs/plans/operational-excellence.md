# Plan: Operational excellence

**Artifact ID:** `ELYSE-OPS-001`  
**Version:** 2.0  
**Last updated:** 2026-08-08  
**Audience:** Agents, implementers, operators  
**Scope:** Reliability posture scorecard, committed SLOs, critical alerting (SMS/voice), and a monthly refresh loop that keeps the scorecard current in `/docs`. Calibrated for a lean personal portfolio — not enterprise multi-team SRE.

Use the **Action ID** column (`OPS-*`) to reference items in PRs, issues, and commits.

**Status values:** `planned` · `in_progress` · `blocked` · `done` · `wont_fix`

**Implementation stance:** This document is the backlog. Do **not** implement Terraform receivers, materials synthetics, FCP wiring, scorecard persistence, or the monthly workflow until an `OPS-*` item is explicitly picked up. Prefer **one phase (or one `OPS-*` item) per PR**.

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

**Today’s gap:** `alert_email` is a plain Terraform variable. When implementing alerting, **replace** it with Key Vault–backed `ALERT-*` secrets — do not add plaintext phone variables.

**Separate from contact-form notify:** `SITE-CONTACT-*` in `kv-elyse-shared` are for ACS inquiry delivery. Ops alert contacts use dedicated `ALERT-*` secrets in **env** vaults (`kv-elyse-staging` / `kv-elyse-prod`).

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
| Alerting & on-call | 2.0 | Thin | TF alerts if `alert_email` set | Empty default; no SMS/voice |
| Resilience & DR | 2.0 | Thin | Git rollback; env isolation; East US 2 only | Single region; shared ACS/Turnstile coupling |
| SLOs & error budget | 1.5 | Gap | Implicit homepage ping | Written SLOs not scored yet |

**Baseline weighted overall:** ~**3.4 / 5** (B+). Verdict: strong change safety and docs; thin detect-and-respond.

### Scorecard persistence + monthly refresh

When implemented (`OPS-P0-003`, `OPS-P0-004`):

| Artifact | Path | Role |
|----------|------|------|
| **Persisted scorecard** | [`docs/ops/operational-excellence-scorecard.md`](../ops/operational-excellence-scorecard.md) | Living scores, evidence, gaps, overall, last reviewed date |
| **This plan** | `docs/plans/operational-excellence.md` | Rubric, SLO/alerting backlog, workflow contract — not the monthly scores |
| **History (optional)** | `docs/ops/scorecard-history/` or appendix in the scorecard | Prior month snapshots if useful |

**Monthly workflow (planned):**

1. **Trigger:** GitHub Actions `schedule` (e.g. `0 14 1 * *` — 1st of month 14:00 UTC) + `workflow_dispatch`.
2. **Job:** Re-evaluate each dimension using a checked-in rubric checklist / script (and optional read-only Azure/App Insights queries via OIDC). Update `docs/ops/operational-excellence-scorecard.md` (scores, evidence, gaps, `Last reviewed`, overall).
3. **Privacy:** Workflow must **never** write alert emails, phones, or secrets into the scorecard or logs.
4. **Output:** Open a PR (preferred) titled `OPS: monthly operational excellence scorecard` for human review — do not push directly to `main` unless product later opts in.
5. **Failure:** If Azure queries fail, still refresh qualitative dimensions and mark SLI-backed rows `blocked` / stale with a note.

Until `OPS-P0-003` ships, the baseline table above is the only checked-in score snapshot (inside this plan).

---

## Committed SLOs

| ID | SLO | Target | SLI (intended) | Instrumentation today |
|----|-----|--------|----------------|------------------------|
| **SLO-1** | Homepage availability | **99.8% over 7 days** | App Insights homepage web test success | Measurable (prod web test exists) |
| **SLO-4** | Materials availability | **99.8% over 7 days** | Synthetic GET resume PDF + theatrical headshot → 200 | Needs prod web tests |
| **SLO-6** | Homepage FCP | **Field p75 &lt; 1.5 s over 7 days** | CrUX or RUM FCP on `/` | Needs field pipeline |
| **SLO-2** | Studio publish success | **95% over 28 days** (≥3 attempts) | `StudioPublishUiSuccess` / (Success+Failed); exclude allowlist denials | Measurable |
| **SLO-3** | Publish → live latency | **p95 ≤ 20 minutes over 28 days** | `StudioPublishToProdDurationMs` | Measurable |

**Error budget (availability):** 99.8% / 7d ≈ **20 minutes** / week (~≤2 failed 10-minute probes). Page on the first Sev1 window; use the weekly % as the scorecard input for `slo` / `alerting`.

**Process invariant (not an SLO):** 100% of production site deploys reuse a staging-verified artifact after green smoke (and journeys when required).

**Next (not committed):** Inquiry accept rate 99% / 28d after contact failure telemetry (`OPS-P3-004`).

---

## Severity → channel model

| Severity | Examples | Channels | Ack expectation |
|----------|----------|----------|-----------------|
| **Sev1 — critical** | Homepage or materials availability fail; Deploy Production failed leaving prod broken | Email + SMS immediately; voice if unacked in 5 min (Phase 2) or native voice (Phase 1) | Respond / silence within 15 min |
| **Sev2 — urgent** | Failed-request spike; Studio publish failures ≥2 / 24h | Email + SMS (no voice) | Same day |
| **Sev3 — watch** | FCP p75 burn; error-budget Watch state | Email only | Next working session |

---

## Critical alerting plan

### Phase 1 — Azure Monitor native

1. Env Key Vault: `ALERT-EMAIL`, `ALERT-SMS-PHONE`, optional `ALERT-VOICE-PHONE` (placeholders in TF; real values via CLI only).
2. Action Groups: `ag-elyse-notify` (email ± SMS), `ag-elyse-critical` (email + SMS + voice).
3. Homepage availability → **critical**; failed-request → **notify**.
4. Prove with Action Group test + controlled threshold exercise.

### Phase 2 — Escalate-if-unacked phone

1. Webhook → PagerDuty / Better Stack / Opsgenie.
2. SMS → voice if unacked in **5 minutes**.
3. Routing keys only in Key Vault or GitHub Environment secrets.
4. Prefer disabling simultaneous native Azure voice once the vendor owns escalation.

### Non-goal

Do **not** send ops alerts through ACS contact-form SMS (`ACS-SMS-FROM` + `SITE-CONTACT-PHONE`).

---

## Phased backlog

### Phase 0 — Plan, scorecard contract, secrets naming

| Action ID | Work | Acceptance criteria | Status |
|-----------|------|---------------------|--------|
| `OPS-P0-001` | Operational excellence plan + agent rule; privacy (no contacts in git) | Plan + AGENTS + cursor rule; no real contacts in repo | `done` |
| `OPS-P0-002` | Define `ALERT-*` secret names in rotate-secrets (placeholders only) | Runbook lists names, vault, set commands; no real values | `planned` |
| `OPS-P0-003` | Persist initial scorecard under `docs/ops/operational-excellence-scorecard.md` | File exists; baseline scores copied from this plan; no private contacts | `planned` |
| `OPS-P0-004` | Monthly GitHub Actions workflow to re-evaluate scorecard + open PR | `schedule` + `workflow_dispatch`; updates scorecard doc; PR for review | `planned` |

### Phase 1 — Key Vault–backed email + SMS + voice

| Action ID | Work | Acceptance criteria | Status |
|-----------|------|---------------------|--------|
| `OPS-P1-001` | Replace `alert_email` TF variable with data source from `ALERT-EMAIL` | No email in tfvars/examples; skip receivers when `REPLACE_ME` | `planned` |
| `OPS-P1-002` | Add `ALERT-SMS-PHONE` (+ voice) on critical/notify groups | SMS/voice on Action Group test; numbers only in Key Vault | `planned` |
| `OPS-P1-003` | Confirm prod homepage Sev1 → critical group | Controlled test documents receipt (without committing PII) | `planned` |

### Phase 2 — Materials + FCP SLIs

| Action ID | Work | Acceptance criteria | Status |
|-----------|------|---------------------|--------|
| `OPS-P2-001` | Prod web tests for resume PDF + headshot | 99.8%/7d scoring; Sev1 → critical | `planned` |
| `OPS-P2-002` | Field FCP p75 for `/` (CrUX or web-vitals → App Insights) | Weekly score vs 1.5s; Sev3 email only when burned | `planned` |
| `OPS-P2-003` | Optional lab FCP gate on staging | Documents median FCP &lt; 1.5s policy (soft or hard) | `planned` |

### Phase 3 — Studio scorecards, escalation product, hardening

| Action ID | Work | Acceptance criteria | Status |
|-----------|------|---------------------|--------|
| `OPS-P3-001` | Kusto + cadence for SLO-2 / SLO-3 in observability runbook | Queries documented; monthly scorecard can cite them | `planned` |
| `OPS-P3-002` | Optional PagerDuty/Better Stack + 5-minute escalate | Routing key in vault/GH secrets; mobile ack works | `planned` |
| `OPS-P3-003` | Deploy Production failure → Sev1 path | CD break pages SMS (and Phase 2 voice policy) | `planned` |
| `OPS-P3-004` | Inquiry accept-rate SLO (optional) | Contact 5xx SLI excluding Turnstile bots | `planned` |
| `OPS-P3-005` | Short incident severity + response stub runbook | Links severity table; no private phones in doc | `planned` |
| `OPS-P3-006` | Prod KV purge protection (optional harden) | Documented decision + TF if accepted | `planned` |

---

## Dependency graph

```text
OPS-P0-001 (this plan / AI guidance) [done]
    ├── OPS-P0-002 (ALERT-* in rotate-secrets)
    │       └── OPS-P1-001 (KV-backed email)
    │               ├── OPS-P1-002 (SMS/voice)
    │               │       └── OPS-P1-003 (homepage Sev1 prove-out)
    │               │               ├── OPS-P2-001 (materials → critical)
    │               │               └── OPS-P3-003 (CD failure → Sev1)
    │               └── OPS-P2-002 / OPS-P2-003 (FCP)
    ├── OPS-P0-003 (persist scorecard under docs/ops/)
    │       └── OPS-P0-004 (monthly re-evaluate workflow → PR)
    └── OPS-P3-001 / OPS-P3-005 (Studio cadence + IR stub) — parallel
OPS-P3-002 (PagerDuty) — after OPS-P1-002
```

---

## Out of scope

- Multi-region active-passive / vanity 99.99% claims
- Authenticated Studio E2E in CI
- Using ACS inquiry SMS as the on-call channel
- Committing real emails, phones, or vendor API keys
- Auto-merging monthly scorecard PRs without review
- Full enterprise incident-management / paging product as a day-one requirement

---

## Related docs

| Doc | Role |
|-----|------|
| [observability.md](../runbooks/observability.md) | App Insights, Kusto; optional `alert_email` (superseded by `OPS-P1-*`) |
| [rotate-secrets.md](../runbooks/rotate-secrets.md) | Key Vault SoT; extend with `ALERT-*` (`OPS-P0-002`) |
| [testing-strategy.md](../runbooks/testing-strategy.md) | Staging gates; smoke covers materials URLs |
| [deploy-and-rollback.md](../runbooks/deploy-and-rollback.md) | Change-safety evidence for scorecard |
| [cost-and-quotas.md](../runbooks/cost-and-quotas.md) | Budget alerts (separate from Sev1) |
| [search-and-analytics.md](search-and-analytics.md) | GA4/GSC — not ops paging |
| `docs/ops/operational-excellence-scorecard.md` | Living scorecard (created by `OPS-P0-003`) |
