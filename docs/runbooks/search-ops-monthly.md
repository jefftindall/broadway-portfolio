# Runbook: Monthly Search Console + Analytics review

**Action IDs:** `SEARCH-P3-001`, `SEARCH-P3-002`, `SEARCH-P3-003`  
**Automation track (required):** `SEARCH-P4-001`–`004` → casting `DISC-P4-003` / `DISC-P4-004`  
**Related:** `DISC-P3-006` (casting landers from query review); [casting-discoverability.md](../plans/casting-discoverability.md) Tier 4  
**Audience:** Jeff (operator); outcomes may create casting/content backlog for Elyse

## Manual vs automated

| Mode | Status | Notes |
|------|--------|-------|
| **Automated extract** (`SEARCH-P4-002`) | **SoT** — `.github/workflows/search-ops-semimonthly.yml` → [`docs/ops/search-signals/`](../ops/search-signals/) | GSC queries/CTR + GA landings → signal artifact; **no Gemini** |
| **Manual checklist below** | Fallback only | Use when the semimonthly artifact is missing/stale; do not plan ops around clicking through consoles |
| Ops scorecard visits/contacts (`OPS-P5-*`) | Separate | Thin activity glance; does **not** include GSC queries/CTR |

App Insights answers “is Studio/prod healthy?”; GSC + GA4 answer “who finds us in search, where do they land, and do they inquire or download materials?”

Cadence: search signals **semimonthly** (1st and 15th, **15:00 UTC** — twice a month). Ops scorecard ACS digest stays monthly (1st at 14:00). Manual fallback / `DISC-P3-006` still align roughly with month boundaries.

**Privacy:** Do not commit inquiry PII, raw export dumps with emails, or screenshots that include private contacts. Backlog notes in git stay high-level (paths, query themes, CTR gaps).

**AI credits:** Search extract jobs must not call Gemini. Lander **body** drafts use **`GEMINI_MODEL_SEARCH_OPS`** (default `gemini-3.5-flash`), separate from Studio’s `GEMINI_MODEL` (`gemini-3.6-flash`) — per-model **5 RPM / 20 RPD**. See [cost-and-quotas.md](cost-and-quotas.md) and `DISC-P4-000`.

**Setup:** GSC API access — [gsc-data-api-access.md](gsc-data-api-access.md) (`SEARCH-P4-001`). GA Data API — [ga-data-api-access.md](ga-data-api-access.md).

---

## Before you start

| Check | Where |
|-------|--------|
| Latest signal artifact | [`docs/ops/search-signals/latest.json`](../ops/search-signals/latest.json) (window since last run) |
| GSC property for `elysetindall.com` | [Search Console](https://search.google.com/search-console) |
| GA4 property / Measurement ID `G-XEE29C0RRE` | [Analytics](https://analytics.google.com/) |
| Preferred host still apex | `www` → apex 301 ([dns-and-domain.md](dns-and-domain.md)) |
| Optional: last month’s scorecard activity | ACS digest / [`operational-excellence-scorecard.md`](../ops/operational-excellence-scorecard.md) § Site performance |
| Secrets populated | `GSC-SITE-URL` (+ GA/GSC SA) in `kv-elyse-shared` |

Residual one-time ops (not required every month): request indexing (`SEARCH-P0-004`), measurement-only GA Admin (`SEARCH-P1-005`), DebugView event verify.

---

## Monthly checklist (`SEARCH-P3-001`) — fallback

Work the previous **calendar month** only as a manual fallback. **Skip this table when `SEARCH-P4-002` has already produced a fresh artifact** under [`docs/ops/search-signals/`](../ops/search-signals/) (see `latest.json`; window is since the last run).

| # | Source | Look at | Healthy if… | If not… |
|---|--------|---------|-------------|---------|
| 1 | **GSC → Performance** | Queries, CTR, impressions on `/for/*`, `/lessons`, brand vs non-brand | Brand queries healthy; non-brand landers not collapsing | Refine titles/descriptions or plan a new/refined lander (`DISC-P3-002` / `DISC-P4-004`) |
| 2 | **GSC → Pages** (indexing) | Coverage errors; unexpected URLs (`/studio`, old WP paths) | No soft-404 / redirect loops; `/studio` not indexed | One-hop 301s / `noIndex` / sitemap filter ([staticwebapp.config.json](../../public/staticwebapp.config.json)) |
| 3 | **GA4 → Acquisition → Organic Search** | Landing pages, engagement | Money pages (`/`, `/materials`, `/shows`, `/for/*`) appear | Fix weak landers; promote strong ones in nav/home |
| 4 | **GA4 → Events** | `generate_lead`, `file_download`, `select_content` by landing page | Inquiries/downloads attach to intended landers | Prioritize content refresh on pages with traffic but no conversion |
| 5 | **GA4 ↔ GSC** (linked) | Query → page → conversion | Clear story for top queries | Decide content vs technical fix |
| 6 | **GSC → Experience / CWV** | LCP on hero/reel-heavy pages (mobile) | No new “poor” regressions after ship | Perf follow-up (`SEARCH-P3-003`) |
| 7 | **GSC → Enhancements** | Person, VideoObject, EducationalOrganization, Offer | No new critical schema errors | Rich Results Test before/after; schema in `Seo.astro` / page JSON-LD |

Automation coverage target: rows **1–5** via `SEARCH-P4-002`; rows **6–7** may stay manual or thin API later.

---

## Feed outcomes into the casting backlog (`SEARCH-P3-002`)

For each meaningful finding, either:

1. **Open or update a `DISC-*` item** in [casting-discoverability.md](../plans/casting-discoverability.md) (Tier 2–4 landers, title/description tweaks, Person facts), **or**
2. **Ship a small content PR** (new `/for/*` lander, copy fix) and reference the review month in the PR body, **or**
3. **When Tier 4 exists:** let `DISC-P4-003`/`004` turn the `SEARCH-P4-002` artifact into a **draft PR** (human merge; Gemini ≤2–3 bodies/month).

Rules of thumb:

| Finding | Typical backlog action |
|---------|------------------------|
| High impressions, low CTR on a `/for/*` URL | Rewrite title/meta; keep bare title contract ([add-casting-page.md](add-casting-page.md)) |
| Query cluster with no lander | New casting page (`DISC-P3-002` / catalog `DISC-P4-001`) |
| Traffic to weak page, no `generate_lead` / downloads | Content or CTA refresh — not a new GA event |
| `/studio` or legacy WP URL in GSC | Technical fix (301 / robots) — not a DISC content item |

Do **not** paste full GSC query export tables into the plan doc. Summarize: query theme, page path, proposed `DISC-*` / PR.

---

## After major visual changes (`SEARCH-P3-003`)

When shipping a large hero, reel, or layout change (especially above-the-fold imagery):

1. Wait for GSC Experience / CWV to refresh (often days to weeks).
2. Re-check mobile LCP / CWV for `/` and reel-heavy URLs.
3. If field CWV regresses, open a perf follow-up (lab FCP / image weight / RUM) — see [observability.md](observability.md) and ops FCP SLOs.
4. Note the check in the PR or release notes (“CWV re-check pending / done YYYY-MM”).

You do not need to wait for the monthly calendar to run this after a visual ship.

---

## What the ops scorecard already covers

The monthly ACS digest / scorecard may include **visits, top paths, inquiry counts, Studio publishes** (`OPS-P5-*`). Use that as a thin activity glance. It does **not** include GSC queries, CTR, or indexing coverage — those stay in this runbook / `SEARCH-P4-*`.

---

## Related

| Doc | Role |
|-----|------|
| [search-and-analytics.md](../plans/search-and-analytics.md) | `SEARCH-*` backlog + Phase 4 automation |
| [docs/ops/search-signals/](../ops/search-signals/) | Biweekly `SEARCH-P4-002` artifact (since last run) |
| [gsc-data-api-access.md](gsc-data-api-access.md) | GSC API SA + `GSC-SITE-URL` (`SEARCH-P4-001`) |
| [casting-discoverability.md](../plans/casting-discoverability.md) | `DISC-*` content backlog + Tier 4 pipeline |
| [monthly-site-check-in.md](monthly-site-check-in.md) | How Elyse reads the ACS digest (not this GSC review) |
| [ga-data-api-access.md](ga-data-api-access.md) | Automating GA visits into the scorecard (ops) + organic landings for search signals |
| [cost-and-quotas.md](cost-and-quotas.md) | Gemini RPM/RPD shared with Studio |
| [observability.md](observability.md) | App Insights vs GA4 |
