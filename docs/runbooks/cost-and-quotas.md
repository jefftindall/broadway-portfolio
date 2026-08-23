# Runbook: Cost and quotas

## Expected monthly Azure cost (retail)

Region: **eastus2** (all environments). Rates: Azure Retail Prices API (`prices.azure.com`), Consumption / pay-as-you-go USD. Recalculate whenever billable resources are added, removed, or resized — see [`.cursor/rules/ops-operational-excellence.mdc`](../../.cursor/rules/ops-operational-excellence.mdc).

**Last calculated:** 2026-08-23 · **Expected total: $26.69 / month**

| Item | Qty / assumption | Unit rate | USD/mo |
|------|------------------|-----------|--------|
| Static Web Apps Standard | staging + prod | $9.00 / app / mo | **18.00** |
| App Insights standard web tests (prod) | 3 tests × 1 geo × every 10 min → 12,960 exec/30d | $0.0005 / execution | **6.48** |
| Key Vault Standard | ×3 (shared + staging + prod), light ops | $0.03 / 10K ops | **0.03** |
| tfstate storage (`stelysetfstateeu2`) | Standard LRS, &lt;1 GB | $0.024 / GB-mo | **0.03** |
| Studio CRM Table Storage (`STUDIO-P1-001`) | staging + prod Standard **RA-GRS** (`stelysecrmstaging`, `stelysecrmprod`); &lt;1 GB tables each; eastus2 → paired Central US | Tables RA-GRS data **$0.075** / GB-mo · ops **$0.00036** / 10K (Azure Tables list / eastus2, 2026-08-23) | **0.15** |
| Log Analytics / App Insights | &lt;5 GB Analytics Logs; 30-day retention | First 5 GB/mo free; retention ≤31d free | **0.00** |
| ACS Email | ~50–100 inquiry + OPS digest msgs | $0.00025 / email + $0.00012 / MB | **0.03** |
| SWA bandwidth | Within included 100 GB / subscription | Overage $0.20 / GB | **0.00** |
| Monitor Action Group SMS / voice | Steady-state idle | $0.00645 / SMS · $0.013 / voice (US) | **0.00** |
| ACS US toll-free number | Leased on `acs-elyse-shared`; E.164 in Key Vault `ACS-SMS-FROM` | **$2.00 / mo** while leased | **2.00** |
| **Azure expected total** | | | **26.69** |

**ACS toll-free note:** Lease billing starts when the number is purchased. **Toll-free verification** often takes on the order of **~5 weeks** before SMS can send. Keeping the number in `ACS-SMS-FROM` (shared KV) during that wait is fine — the API still skips SMS until the number is usable / not `REPLACE_ME`. Email inquiry notify continues to work. See [rotate-secrets.md](rotate-secrets.md) § Shared SMS.

### Subscription budget (OPS-P4-001)

| Field | Value |
|-------|--------|
| Formula | `ceil(expected_monthly_usd × 1.25)` |
| Expected | **$26.69** |
| Budget amount | **$34 / month** (`budget-elyse-portfolio-monthly` in `infra/bootstrap/budget.tf`) |
| Actual alerts | **80%** and **100%** → Key Vault `ALERT-EMAIL` only (Owners fallback if `REPLACE_ME`) |
| 80% of budget | ≈ **$27.20** (≈ expected retail total) |

The monthly OPS scorecard digest also reports last-month spend and MoM trend to both `ALERT-EMAIL` and `SITE-CONTACT-EMAIL` (ACS email; recipients never in git). **How to read it (Elyse):** [monthly-site-check-in.md](monthly-site-check-in.md).

### Non-Azure (not in subscription budget)

| Item | Notes |
|------|--------|
| Gemini API — **Studio** | Env `GEMINI_MODEL` (default **`gemini-3.6-flash`**). Independent free-tier-style limits on that model ID: plan against **5 requests/minute** and **20 requests/day** (confirm in Google AI Studio / Cloud for the live `GEMINI_API_KEY` project). Set a billing alert if on paid. |
| Gemini API — **search ops / lander drafts** | Env **`GEMINI_MODEL_SEARCH_OPS`** (default **`gemini-3.5-flash`**). **Separate** from Studio’s model — **3.5 Flash and 3.6 Flash have independent RPM/RPD**. Same API key may call both; do **not** point search-ops jobs at `GEMINI_MODEL` / 3.6. Plan against **5 RPM / 20 RPD** on the search-ops model unless the console shows higher. Lander automation (`DISC-P4-*`): **zero Gemini** for GSC/GA extract (`SEARCH-P4-002`); **≤2–3 lander body calls/month** on `GEMINI_MODEL_SEARCH_OPS`; one call per draft page; 429 → backoff + defer; prefer templates for catalog fill (`DISC-P4-001`). See [casting-discoverability.md](../plans/casting-discoverability.md) `DISC-P4-000`. |
| GitHub | Free for private/public depending on plan |

## Quotas / limits

- SWA build minutes and bandwidth per tier — see Azure docs
- GitHub Git Data / Contents API rate limits — Studio traffic is low; publishes use one commit per update with transient retries
- Photo commits grow the git repo — compress before upload (Studio already resizes)
- **Gemini models (two configs)** — Studio: `GEMINI_MODEL` → `gemini-3.6-flash`. Search ops / `/for/` drafts: `GEMINI_MODEL_SEARCH_OPS` → `gemini-3.5-flash`. Do not reinstate shut-down IDs such as `gemini-2.0-flash`. If either path fails with quota/429, confirm **that path’s model ID** and that the API key’s Google project matches the quotas you are viewing (per-model, not shared across 3.5 vs 3.6).
- **Gemini rate limits** — Treat Studio and search-ops budgets as **independent**. Draft jobs must not multi-turn agent-loop in CI; defer on 429 rather than retry-storm. Optional paid upgrade / higher quota is an explicit dependency before raising monthly draft caps on either model.

## Alerts

- Azure **subscription** budget `$34/mo` → `ALERT-EMAIL` at **80%** / **100%** Actual (bootstrap TF)
- Monthly OPS scorecard ACS digest (spend + MoM + scores) → `ALERT-EMAIL` + `SITE-CONTACT-EMAIL` ([how to read it](monthly-site-check-in.md))
- Gemini/Google billing alert (console; not in this repo)
- GitHub Actions email on failed workflow
- Application Insights: 1 GB/day cap, 30-day retention, failed-request + prod availability (homepage + materials) + FCP watch alerts (see [observability.md](observability.md))
