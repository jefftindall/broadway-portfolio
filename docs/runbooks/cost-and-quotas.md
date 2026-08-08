# Runbook: Cost and quotas

## Expected monthly Azure cost (retail)

Region: **eastus2** (all environments). Rates: Azure Retail Prices API (`prices.azure.com`), Consumption / pay-as-you-go USD. Recalculate whenever billable resources are added, removed, or resized — see [`.cursor/rules/ops-operational-excellence.mdc`](../../.cursor/rules/ops-operational-excellence.mdc).

**Last calculated:** 2026-08-08 · **Expected total: $24.54 / month**

| Item | Qty / assumption | Unit rate | USD/mo |
|------|------------------|-----------|--------|
| Static Web Apps Standard | staging + prod | $9.00 / app / mo | **18.00** |
| App Insights standard web tests (prod) | 3 tests × 1 geo × every 10 min → 12,960 exec/30d | $0.0005 / execution | **6.48** |
| Key Vault Standard | ×3 (shared + staging + prod), light ops | $0.03 / 10K ops | **0.03** |
| tfstate storage (`stelysetfstateeu2`) | Standard LRS, &lt;1 GB | $0.024 / GB-mo | **0.03** |
| Log Analytics / App Insights | &lt;5 GB Analytics Logs; 30-day retention | First 5 GB/mo free; retention ≤31d free | **0.00** |
| ACS Email | ~50–100 inquiry + OPS digest msgs | $0.00025 / email + $0.00012 / MB | **0.03** |
| SWA bandwidth | Within included 100 GB / subscription | Overage $0.20 / GB | **0.00** |
| Monitor Action Group SMS / voice | Steady-state idle | $0.00645 / SMS · $0.013 / voice (US) | **0.00** |
| ACS US toll-free number | Not leased (`ACS-SMS-FROM` = REPLACE_ME) | $2.00 / mo if enabled | **0.00** |
| **Azure expected total** | | | **24.54** |

### Subscription budget (OPS-P4-001)

| Field | Value |
|-------|--------|
| Formula | `ceil(expected_monthly_usd × 1.25)` |
| Expected | **$24.54** |
| Budget amount | **$31 / month** (`budget-elyse-portfolio-monthly` in `infra/bootstrap/budget.tf`) |
| Actual alerts | **80%** and **100%** → Key Vault `ALERT-EMAIL` only (Owners fallback if `REPLACE_ME`) |
| 80% of budget | ≈ **$24.80** (≈ expected retail total) |

The monthly OPS scorecard digest also reports last-month spend and MoM trend to both `ALERT-EMAIL` and `SITE-CONTACT-EMAIL` (ACS email; recipients never in git).

### Non-Azure (not in subscription budget)

| Item | Notes |
|------|--------|
| Gemini API | Typically pennies/month for light Studio — set a budget alert in Google Cloud / AI Studio |
| GitHub | Free for private/public depending on plan |

## Quotas / limits

- SWA build minutes and bandwidth per tier — see Azure docs
- GitHub Contents API rate limits — Studio traffic is low
- Photo commits grow the git repo — compress before upload (Studio already resizes)
- **Gemini model** — Studio uses `GEMINI_MODEL` (default `gemini-3.6-flash` via code and SWA app settings). `gemini-2.0-flash` was shut down June 1, 2026; calls to it return free-tier quota **limit: 0**. If Studio publish fails with a Gemini/quota error, confirm the deployed model ID and that the API key’s Google project matches the quotas you are viewing in the console.

## Alerts

- Azure **subscription** budget `$31/mo` → `ALERT-EMAIL` at **80%** / **100%** Actual (bootstrap TF)
- Monthly OPS scorecard ACS digest (spend + MoM + scores) → `ALERT-EMAIL` + `SITE-CONTACT-EMAIL`
- Gemini/Google billing alert (console; not in this repo)
- GitHub Actions email on failed workflow
- Application Insights: 1 GB/day cap, 30-day retention, failed-request + prod availability (homepage + materials) + FCP watch alerts (see [observability.md](observability.md))
