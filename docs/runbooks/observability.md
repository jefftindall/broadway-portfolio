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

Optional: set `alert_email` when applying Terraform to create an action group + failed-request / availability metric alerts.

## Cost controls

- Log Analytics + App Insights retention: **30 days**
- Daily ingestion cap: **1 GB** per App Insights component (cap notifications enabled)
- Browser sampling: **25%** staging, **10%** prod (`PUBLIC_APPINSIGHTS_SAMPLE_PERCENT`) for pageviews / generic fetch
- **Studio UI publish events are force-sampled at 100%** (`StudioPublishUiSuccess` / `StudioPublishUiFailed` / `StudioPublishToProdCompleted` and metric `StudioPublishToProdDurationMs`) and flushed after track
- Server: adaptive sampling in `api/host.json` for Request/Dependency, with **`excludedTypes: Event;Exception`** so custom events and exceptions are never dropped
- Custom Functions `TelemetryClient` uses `samplingPercentage = 100` and `flush()` on deny / 500 paths
- Availability test: **prod only**, homepage every **10 minutes**, one geo (`us-va-ash-azr`)

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
| `StudioPublishRequested` | `api` updateContent `mode=publish` (after allowlist; includes `correlationId`) |
| `StudioPublishFailed` | `api` updateContent / uploadMedia catch path (`correlationId`, `errorKind`, `operation`) |
| `StudioToolExecuted` | Gemini tool loop |
| `GitHubCommitSucceeded` / `GitHubCommitFailed` | Contents API commits |
| `GET /api/publisherStatus` | Preflight allowlist check for Studio UI |
| `GET /api/publishStatus` | Studio Done-step pipeline poll (`sha` → Actions run status) |
| Page views / client errors / fetch | Browser SDK in `BaseLayout` |
| `StudioPublishUiSuccess` / `StudioPublishUiFailed` | Studio UI (always sampled; `reason` + optional `correlationId` on failures) |
| `StudioPublishToProdCompleted` | Studio Done-step when Deploy Production succeeds (`durationMs` from Publish click; always sampled) |
| `StudioPublishToProdDurationMs` | Browser custom metric (same window as above; always sampled) |
| `DeployCompleted` | GitHub Actions after SWA upload |

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
| where name in ("StudioAccessDenied", "StudioPublishDenied", "StudioDraftRequested", "StudioDraftFailed", "StudioPublishRequested", "StudioPublishFailed", "StudioToolExecuted", "GitHubCommitSucceeded", "GitHubCommitFailed", "StudioPublishUiSuccess", "StudioPublishUiFailed", "StudioPublishToProdCompleted", "DeployCompleted")
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

Deploy timeline:

```kusto
customEvents
| where name == "DeployCompleted"
| project timestamp, environment = tostring(customDimensions.environment), sha = tostring(customDimensions.sha), job = tostring(customDimensions.job)
| order by timestamp desc
```

Availability (prod):

```kusto
availabilityResults
| summarize avg(success), count() by bin(timestamp, 1h)
| order by timestamp desc
```

## Apply / rotate

```bash
cd infra/environments/staging
terraform apply -var="alert_email=you@example.com"

cd ../prod
terraform apply -var="alert_email=you@example.com"
```

Connection string changes flow to SWA app settings and GitHub Environment variables on apply; the next Actions build picks up the browser SDK value.
