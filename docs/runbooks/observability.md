# Runbook: Observability (Application Insights)

## Resources (per environment)

| Env | App Insights | Log Analytics | Resource group |
|-----|--------------|---------------|----------------|
| Staging | `appi-elyse-portfolio-staging` | `law-elyse-staging` | `rg-elyse-portfolio-staging` |
| Prod | `appi-elyse-portfolio-prod` | `law-elyse-prod` | `rg-elyse-portfolio-prod` |

Terraform wires `APPLICATIONINSIGHTS_CONNECTION_STRING` into the Static Web App (managed Functions) and publishes `APPINSIGHTS_CONNECTION_STRING` as a GitHub Environment variable for the Astro browser SDK and deploy events.

Terraform also publishes GitHub Environment variable `GA_MEASUREMENT_ID` (default `G-XEE29C0RRE`) for Google Analytics 4. Deploy workflows map it to `PUBLIC_GA_MEASUREMENT_ID` at Astro build time. The browser SDK lives in `src/scripts/ga.ts` and is skipped for `noIndex` pages and `/studio`. Override with `-var='ga_measurement_id=G-…'` on apply, or set `PUBLIC_GA_MEASUREMENT_ID` locally (see `.env.example`). App Insights remains the source of truth for Studio/ops telemetry; GA4 is for public traffic and Search Console association. Phased GSC + GA work (including events and the monthly review loop) lives in [search-and-analytics.md](../plans/search-and-analytics.md).

### GA4 public events (`SEARCH-P1-003`)

Fired only when gtag is loaded (public pages). Studio never sends these.

| Event | Trigger | Parameters |
|-------|---------|------------|
| `generate_lead` | Casting / lesson inquiry HTTP success | `form_type` = `casting` \| `lesson` |
| `file_download` | Click on materials download link | `file_name`, `file_extension`, `link_url`, `link_text` |
| `select_content` | Primary reel / materials CTA click | `content_type` = `reel` \| `materials`; `content_id` (stable id, e.g. `watch-reel`) |

Helper: `trackGaEvent` in `src/lib/analytics.ts`. Declarative clicks use `data-ga-event` (+ related `data-ga-*` attrs) with a capture-phase listener in `src/scripts/ga.ts`.

Verify after deploy: GA4 **Admin → DebugView** (or Realtime) while submitting an inquiry / clicking downloads on staging or prod with a debug cookie / browser extension as needed.

### GA4 property settings (`SEARCH-P1-005`)

Measurement-only checklist for the `elysetindall.com` property (`G-XEE29C0RRE`):

1. Leave **Google signals** / ads personalization **off**.
2. Set **data retention** (prefer 14 months) and **reporting time zone** to `America/New_York`.
3. Do not enable advertising / remarketing features unless product explicitly flips this decision.

Consent Mode / cookie banner: **not shipped** (`SEARCH-P1-006` = `wont_fix`). Privacy policy covers GA use without a consent gate.

Availability and failed-request metric alerts wire to Key Vault–backed Action Groups when shared `ALERT-*` secrets are set (not `REPLACE_ME`). See [rotate-secrets.md](./rotate-secrets.md) ops section and [operational-excellence.md](../plans/operational-excellence.md).

**Operational excellence:** Living scorecard at [operational-excellence-scorecard.md](../ops/operational-excellence-scorecard.md). Backlog / SLOs / Sev1 SMS-voice plan: [operational-excellence.md](../plans/operational-excellence.md) (`OPS-*`). Private alert emails/phones must not be committed — only `ALERT-*` in `kv-elyse-shared`. Phase 0–4 done (except optional PagerDuty `OPS-P3-002`). **Phase 5 done in repo:** monthly site performance (GA4 visits/top pages + App Insights contact/Studio-update counts) in the scorecard + ACS digest — populate `GA-*` secrets per [ga-data-api-access.md](ga-data-api-access.md) before visits appear.

## Action Groups (OPS-P1 / OPS-P2 / OPS-P3)

| Group | Name pattern | Channels | Wired alerts |
|-------|--------------|----------|--------------|
| Notify (Sev2) | `ag-elyse-notify-{env}` | Email ± SMS | Failed-request spike |
| Critical (Sev1) | `ag-elyse-critical-{env}` | Email + SMS + voice | Prod homepage + materials availability; **DeployFailed** / **SmokeFailed** (`OPS-P3-003` / `TEST-D-003`) |
| Watch (Sev3) | `ag-elyse-watch-{env}` | Email only | Homepage field FCP p75 burn (`HomepageFcpMs`; 2d watch window; SLO-6 scored over 7d in scorecard) |

Contacts: `ALERT-EMAIL`, `ALERT-SMS-PHONE`, `ALERT-VOICE-PHONE` in `kv-elyse-shared`. Invalid / `REPLACE_ME` values skip that receiver; if all contacts are placeholders, Action Groups and metric alerts are not created. Watch group requires a real `ALERT-EMAIL`.

## Cost controls

- Log Analytics + App Insights retention: **30 days**
- Daily ingestion cap: **1 GB** per App Insights component (cap notifications enabled)
- Browser sampling: **25%** staging, **10%** prod (`PUBLIC_APPINSIGHTS_SAMPLE_PERCENT`) for pageviews / generic fetch
- **Studio UI publish events are force-sampled at 100%** (`StudioPublishUiSuccess` / `StudioPublishUiFailed` / `StudioPublishToProdCompleted` and metric `StudioPublishToProdDurationMs`) and flushed after track
- **Studio auth health is force-sampled at 100%** (`StudioAuthOutcome` on `/studio/health` — `TEST-C-005`)
- **Homepage field FCP is force-sampled at 100%** (`HomepageFcpMs` on `/` only — `OPS-P2-002`)
- Server: adaptive sampling in `api/host.json` for Request/Dependency, with **`excludedTypes: Event;Exception`** so custom events and exceptions are never dropped
- Custom Functions `TelemetryClient` uses `samplingPercentage = 100` and `flush()` on deny / 500 paths
- Availability tests: **prod only**, every **10 minutes**, one geo (`us-va-ash-azr`) — homepage, resume PDF, theatrical headshot

To temporarily raise browser sampling for non-Studio traffic, set `PUBLIC_APPINSIGHTS_SAMPLE_PERCENT` in the workflow (or rebuild with a higher env value) and redeploy.

## Correlation IDs (support standard)

Studio returns a **`correlationId`** (shown in the UI as a **reference**) for:

- Allowlist / access denials (`StudioAccessDenied`, `StudioPublishDenied`)
- Publish and upload failures after auth (`StudioPublishFailed` + tracked exceptions)

User-facing messages stay short and non-technical. Full provider/SDK detail is only in Function logs and App Insights, keyed by that ID. When a publisher shares a reference with support, look it up with the queries below.

## What is instrumented

| Signal | Source |
|--------|--------|
| API requests / failures | SWA managed Functions + App Insights |
| `StudioAccessDenied` | `api` publisherStatus (signed in, not allowlisted; includes `correlationId`) |
| `StudioPublishDenied` | `api` updateContent / uploadMedia (allowlist deny; includes `correlationId`) |
| `StudioDraftRequested` / `StudioDraftFailed` | `api` updateContent `mode=draft` (Gemini preview; includes `correlationId`) |
| `StudioPublishRequested` | `api` updateContent `mode=publish` (after allowlist; includes `correlationId`, `publishMode`, `branch`) |
| `StudioStagingBranchCreated` / `StudioStagingBranchMergedBase` | `api` dated staging branch create / merge-from-main |
| `StudioStagingPrCreated` / `StudioStagingPrReused` | `api` open or reuse PR for staging-studio branch |
| `StudioPublishFailed` | `api` updateContent / uploadMedia catch path (`correlationId`, `errorKind`, `operation`) |
| `StudioToolExecuted` | Gemini tool loop |
| `GitHubCommitSucceeded` / `GitHubCommitFailed` | Git Data API single-commit publishes (`fileCount` on success/failure) |
| `GitHubCommitRetry` | Transient GitHub/network or tip-race retry before success/failure |
| `GET /api/publisherStatus` | Preflight allowlist check for Studio UI |
| `GET /api/publishStatus` | Studio Done-step pipeline poll (`sha` → Actions run status) |
| `GET /api/lessonPayConfig` | Public pay-flow flag + Payment Link URLs (no secret keys; empty when prod flag is off) |
| Page views / client errors / fetch | Browser SDK in `BaseLayout` |
| `StudioPublishUiSuccess` / `StudioPublishUiFailed` | Studio UI (always sampled; `reason` + optional `correlationId` on failures) |
| `StudioPublishToProdCompleted` | Studio Done-step when Deploy Production succeeds (`durationMs` from Publish click; always sampled) |
| `StudioPublishToProdDurationMs` | Browser custom metric (same window as above; always sampled) |
| `StudioAuthOutcome` | `/studio/health` after a successful signed-in load (`TEST-C-005`; always sampled) |
| `DeployCompleted` | GitHub Actions after SWA upload (staging or prod) |
| `DeployFailed` | GitHub Actions when **Deploy Production** job fails (`OPS-P3-003`; pages critical AG) |
| `SmokeFailed` | GitHub Actions when **Smoke Production** fails after deploy (`TEST-D-003`; pages critical AG; no auto-rollback) |
| `ContactInquiryReceived` / `ContactInquiryFailed` | Contact form API (`errorKind` on failures; see inquiry SLI below) |

Gemini model-side traces stay in Google — not App Insights. Coarse `errorKind` values include `gemini_quota`, `gemini`, `github`, `config`, `unknown`.

## Useful Kusto (Logs)

Failed requests:

```kusto
requests
| where success == false
| order by timestamp desc
| take 50
```

Allowlist denials (preferred for “signed in but cannot publish”). Studio shows a `correlationId` users can share with an admin:

```kusto
customEvents
| where name in ("StudioAccessDenied", "StudioPublishDenied")
| project timestamp,
    name,
    correlationId = tostring(customDimensions.correlationId),
    userId = tostring(customDimensions.userId),
    userDetails = tostring(customDimensions.userDetails),
    identityProvider = tostring(customDimensions.identityProvider),
    route = tostring(customDimensions.route)
| order by timestamp desc
| take 50
```

```kusto
customEvents
| where name in ("StudioAccessDenied", "StudioPublishDenied")
| where tostring(customDimensions.correlationId) == "<paste-correlation-id>"
| project timestamp, name, userId = tostring(customDimensions.userId), userDetails = tostring(customDimensions.userDetails), identityProvider = tostring(customDimensions.identityProvider)
```

Look up a publish failure by reference ID:

```kusto
customEvents
| where name == "StudioPublishFailed"
| where tostring(customDimensions.correlationId) == "<paste-correlation-id>"
| project timestamp,
    operation = tostring(customDimensions.operation),
    errorKind = tostring(customDimensions.errorKind),
    userId = tostring(customDimensions.userId),
    correlationId = tostring(customDimensions.correlationId)
```

```kusto
exceptions
| where tostring(customDimensions.correlationId) == "<paste-correlation-id>"
| project timestamp, outerMessage, operation = tostring(customDimensions.operation), errorKind = tostring(customDimensions.errorKind)
| order by timestamp desc
```

```kusto
requests
| where name contains "updateContent" and resultCode == "401"
| order by timestamp desc
| take 50
```

Studio / publish events:

```kusto
customEvents
| where name in ("StudioAccessDenied", "StudioPublishDenied", "StudioDraftRequested", "StudioDraftFailed", "StudioPublishRequested", "StudioPublishFailed", "StudioToolExecuted", "GitHubCommitSucceeded", "GitHubCommitFailed", "GitHubCommitRetry", "StudioPublishUiSuccess", "StudioPublishUiFailed", "StudioPublishToProdCompleted", "StudioAuthOutcome", "DeployCompleted", "DeployFailed", "SmokeFailed", "ContactInquiryReceived", "ContactInquiryFailed")
| order by timestamp desc
| take 100
```

Publish → production latency (from Studio Publish click until Deploy Production succeeds):

```kusto
customEvents
| where name == "StudioPublishToProdCompleted"
| extend durationMs = todouble(customDimensions.durationMs)
| summarize avg(durationMs), percentile(durationMs, 50), percentile(durationMs, 95), count() by bin(timestamp, 1d)
| order by timestamp desc
```

```kusto
customMetrics
| where name == "StudioPublishToProdDurationMs"
| summarize avg(value), percentile(value, 50), percentile(value, 95), count() by bin(timestamp, 1d)
| order by timestamp desc
```

### Committed Studio SLOs (OPS-P3-001) — monthly cadence

Run these in **prod** App Insights Logs (or let `node scripts/ops-scorecard-refresh.mjs --azure` probe them). Cite results in the monthly scorecard commit. Targets: **SLO-2** 95% / 28d (≥3 attempts); **SLO-3** p95 ≤ 20 minutes (1_200_000 ms) / 28d.

**SLO-2 — Studio publish success** (exclude allowlist denials and draft-mode UI failures):

```kusto
customEvents
| where timestamp > ago(28d)
| where name in ("StudioPublishUiSuccess", "StudioPublishUiFailed")
| extend operation = tostring(customDimensions.operation)
| extend reason = tostring(customDimensions.reason)
| where name == "StudioPublishUiSuccess"
    or (name == "StudioPublishUiFailed" and operation == "publish" and reason != "unauthorized")
| summarize
    successes = countif(name == "StudioPublishUiSuccess"),
    failures = countif(name == "StudioPublishUiFailed"),
    attempts = count()
| extend successPct = 100.0 * successes / attempts
| project successPct, successes, failures, attempts
```

**SLO-3 — publish → live p95** (samples successful Deploy Production only):

```kusto
customMetrics
| where timestamp > ago(28d)
| where name == "StudioPublishToProdDurationMs"
| summarize samples = count(), p50 = percentile(value, 50), p95 = percentile(value, 95)
```

Cadence: monthly scorecard workflow (`OPS-P0-004`) with `--azure`; ad-hoc after a busy Studio week. If `attempts < 3` for SLO-2 (or no latency samples for SLO-3), mark the row `stale` — do not invent a pass/fail.

### Inquiry accept-rate SLI (OPS-P3-004) — not yet a committed SLO

Intended target when promoted: **99% / 28d**. Exclude bots (`turnstile_rejected`) and client validation (`validation`). Treat infra/provider failures (`acs`, `acs_temporary`, `config`, `turnstile` siteverify outage, `unknown`) as failures.

```kusto
customEvents
| where timestamp > ago(28d)
| where name in ("ContactInquiryReceived", "ContactInquiryFailed")
| extend errorKind = tostring(customDimensions.errorKind)
| where name == "ContactInquiryReceived"
    or (name == "ContactInquiryFailed"
        and errorKind !in ("turnstile_rejected", "validation"))
| summarize
    accepted = countif(name == "ContactInquiryReceived"),
    failed = countif(name == "ContactInquiryFailed"),
    n = count()
| extend acceptPct = 100.0 * accepted / n
| project acceptPct, accepted, failed, n
```

Monthly `--azure` refresh probes this into `optionalSlos` (scorecard evidence only until product commits the SLO).

### Site performance — previous calendar month (OPS-P5-004)

Used by `ops-scorecard-refresh.mjs` for the scorecard `sitePerformance` block (counts only — never inquiry PII). Substitute the previous month’s UTC bounds (example: July 2026 → `2026-07-01` inclusive start, `2026-08-01` exclusive end).

Contacts (split by form type):

```kusto
customEvents
| where timestamp >= datetime(2026-07-01) and timestamp < datetime(2026-08-01)
| where name == "ContactInquiryReceived"
| extend type = tostring(customDimensions.type)
| summarize
    total = count(),
    casting = countif(type == "casting"),
    lesson = countif(type == "lesson")
| project total, casting, lesson
```

Studio publishes (UI success):

```kusto
customEvents
| where timestamp >= datetime(2026-07-01) and timestamp < datetime(2026-08-01)
| where name == "StudioPublishUiSuccess"
| summarize studioPublishes = count()
| project studioPublishes
```

Visits / top pages come from the **GA4 Data API** (not App Insights pageViews) — see [ga-data-api-access.md](ga-data-api-access.md).

Deploy timeline:

```kusto
customEvents
| where name in ("DeployCompleted", "DeployFailed", "SmokeFailed")
| project timestamp, name, environment = tostring(customDimensions.environment), sha = tostring(customDimensions.sha), job = tostring(customDimensions.job)
| order by timestamp desc
```

Availability (prod — all synthetics):

```kusto
availabilityResults
| summarize avg(success), count() by name, bin(timestamp, 1h)
| order by timestamp desc
```

Materials only (SLO-4):

```kusto
availabilityResults
| where name has "resume" or name has "headshot"
| where timestamp > ago(7d)
| summarize availabilityPct = avg(todouble(success)) * 100, probes = count()
```

Homepage field FCP (SLO-6):

```kusto
customMetrics
| where name == "HomepageFcpMs"
| where timestamp > ago(7d)
| summarize samples = count(), p50 = percentile(value, 50), p75 = percentile(value, 75)
```

## Apply / rotate

```bash
# Set ops contacts in shared vault first (placeholders skip Action Groups):
az keyvault secret set --vault-name kv-elyse-shared --name ALERT-EMAIL --value "<email>"
az keyvault secret set --vault-name kv-elyse-shared --name ALERT-SMS-PHONE --value "+1XXXXXXXXXX"
az keyvault secret set --vault-name kv-elyse-shared --name ALERT-VOICE-PHONE --value "+1XXXXXXXXXX"

cd infra/environments/staging
terraform apply

cd ../prod
terraform apply
```

Prove Sev1 receipt via Portal **Test action group** on `ag-elyse-critical-prod` (see [rotate-secrets.md](./rotate-secrets.md)); do not commit contact values.

Connection string changes flow to SWA app settings and GitHub Environment variables on apply; the next Actions build picks up the browser SDK value.
