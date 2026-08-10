# Search signals (`SEARCH-P4-002`)

Machine-readable extract of GSC + GA organic signals **since the last run** (semimonthly schedule, 1st + 15th; first run uses a 14-day lookback) for the operator checklist in [search-ops-monthly.md](../../runbooks/search-ops-monthly.md).

| File | Role |
|------|------|
| `latest.json` / `latest.md` | Current SoT for `DISC-P4-003` / `SEARCH-P4-004` |
| `{from}_{to}.json` / `.md` | Dated snapshot for the inclusive UTC window |

**Privacy:** paths, query themes, numeric bands, truncated public queries only — **no** emails, phones, secrets, or full raw exports.  
**AI:** **Zero Gemini** in the extract job. Lander body drafts stay `DISC-P4-004` on `GEMINI_MODEL_SEARCH_OPS`.

## Coverage (checklist rows 1–5)

| `#` | Source | Artifact field |
|-----|--------|----------------|
| 1 | GSC Performance (queries / brand vs non-brand / themes) | `gsc.themes`, `gsc.topQueries`, `gsc.brandVsNonBrand` |
| 2 | GSC Pages / indexing anomalies | `gsc.pages`, `gsc.focusPages`, `gsc.indexing` |
| 3 | GA organic landings | `ga.landings` |
| 4 | GA events by landing | `ga.conversionsByLanding` |
| 5 | GA ↔ GSC join | `join.rows` |

Rows 6–7 (CWV / Enhancements) remain manual.

## Produce locally

```bash
# Live (needs KV secrets — see gsc-data-api-access.md + ga-data-api-access.md)
# Window = day after latest.json’s toInclusive → yesterday UTC (else 14-day lookback)
source scripts/fetch-ga-scorecard-secrets.sh
source scripts/fetch-gsc-search-secrets.sh
npm run search:signals

# Fixture dry-run (no secrets; logs counts/themes only)
npm run search:signals:fixture
```

Scheduled: `.github/workflows/search-ops-semimonthly.yml` (1st and 15th, 15:00 UTC — twice a month). CD ignores commits under this directory.

## Schema notes for consumers

- Prefer **`latest.json`**. `window.source` is `since_last_run`, `lookback`, or `explicit`.
- `castingLandersInRepo`: `/for/*` paths from `src/content/casting/*.md` at refresh time.
- Impression / CTR **bands** (`impressionBand`, `ctrBand`) are preferred over raw exports for backlog notes.
- `gsc.ok` / `ga.ok` false → section `stale` (credentials missing or API error); do not treat as empty demand.
- Gaps longer than 45 days are capped to the trailing 45 days so a missed schedule does not explode the query.
