# Runbook: Cost and quotas

## Expected monthly cost (approx.)

| Item | Notes |
|------|--------|
| Azure Static Web Apps **Standard** × environments | Staging + prod each need Standard for MI / Key Vault / auth (~$9/mo each) |
| Key Vault × environments | Negligible at this scale |
| State storage (`stelysetfstateeu2`) | Negligible |
| Gemini API | Typically pennies/month for light Studio usage — set a budget alert in Google Cloud/AI Studio |
| GitHub | Free for private/public depending on plan |
| Bandwidth | SWA includes generous bandwidth; watch if video hosting is added later |

## Quotas / limits

- SWA build minutes and bandwidth per tier — see Azure docs
- GitHub Contents API rate limits — Studio traffic is low
- Photo commits grow the git repo — compress before upload (Studio already resizes)
- **Gemini model** — Studio uses `GEMINI_MODEL` (default `gemini-3.6-flash` via code and SWA app settings). `gemini-2.0-flash` was shut down June 1, 2026; calls to it return free-tier quota **limit: 0**. If Studio publish fails with a Gemini/quota error, confirm the deployed model ID and that the API key’s Google project matches the quotas you are viewing in the console.

## Alerts

- Azure budget alert on the resource group
- Gemini/Google billing alert
- GitHub Actions email on failed workflow
- Application Insights: 1 GB/day cap, 30-day retention, failed-request + prod availability (homepage + materials) + FCP watch alerts (see [observability.md](observability.md))
