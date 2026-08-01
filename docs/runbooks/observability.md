# Runbook: Observability (Application Insights)

## Resources (per environment)

| Env | App Insights | Log Analytics | Resource group |
|-----|--------------|---------------|----------------|
| Staging | `appi-elyse-portfolio-staging` | `law-elyse-staging` | `rg-elyse-portfolio-staging` |
| Prod | `appi-elyse-portfolio-prod` | `law-elyse-prod` | `rg-elyse-portfolio-prod` |

Terraform wires `APPLICATIONINSIGHTS_CONNECTION_STRING` into the Static Web App (managed Functions) and publishes `APPINSIGHTS_CONNECTION_STRING` as a GitHub Environment variable for the Astro browser SDK and deploy events.

Optional: set `alert_email` when applying Terraform to create an action group + failed-request / availability metric alerts.

## Cost controls

- Log Analytics + App Insights retention: **30 days**
- Daily ingestion cap: **1 GB** per App Insights component (cap notifications enabled)
- Browser sampling: **25%** staging, **10%** prod (`PUBLIC_APPINSIGHTS_SAMPLE_PERCENT`) for pageviews / generic fetch
- **Studio UI publish events are force-sampled at 100%** (`StudioPublishUiSuccess` / `StudioPublishUiFailed`) and flushed after track
- Server: adaptive sampling in `api/host.json` for Request/Dependency, with **`excludedTypes: Event;Exception`** so custom events and exceptions are never dropped
- Custom Functions `TelemetryClient` uses `samplingPercentage = 100` and `flush()` on deny / 500 paths
- Availability test: **prod only**, homepage every **10 minutes**, one geo (`us-va-ash-azr`)

To temporarily raise browser sampling for non-Studio traffic, set `PUBLIC_APPINSIGHTS_SAMPLE_PERCENT` in the workflow (or rebuild with a higher env value) and redeploy.

## What is instrumented

| Signal | Source |
|--------|--------|
| API requests / failures | SWA managed Functions + App Insights |
| `StudioAccessDenied` | `api` publisherStatus (signed in, not allowlisted; includes `correlationId`) |
| `StudioPublishDenied` | `api` updateContent / uploadMedia (allowlist deny; includes `correlationId`) |
| `StudioPublishRequested` | `api` updateContent (after allowlist) |
| `StudioToolExecuted` | Gemini tool loop |
| `GitHubCommitSucceeded` / `GitHubCommitFailed` | Contents API commits |
| `GET /api/publisherStatus` | Preflight allowlist check for Studio UI |
| Page views / client errors / fetch | Browser SDK in `BaseLayout` |
| `StudioPublishUiSuccess` / `StudioPublishUiFailed` | Studio UI (always sampled; `reason` on failures) |
| `DeployCompleted` | GitHub Actions after SWA upload |

Gemini model-side traces stay in Google — not App Insights.

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

```kusto
requests
| where name contains "updateContent" and resultCode == "401"
| order by timestamp desc
| take 50
```

Studio / publish events:

```kusto
customEvents
| where name in ("StudioAccessDenied", "StudioPublishDenied", "StudioPublishRequested", "StudioToolExecuted", "GitHubCommitSucceeded", "GitHubCommitFailed", "StudioPublishUiSuccess", "StudioPublishUiFailed", "DeployCompleted")
| order by timestamp desc
| take 100
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
