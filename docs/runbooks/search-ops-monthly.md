# Runbook: Monthly Search Console + Analytics review

**Action IDs:** `SEARCH-P3-001`, `SEARCH-P3-002`, `SEARCH-P3-003`  
**Related:** `DISC-P3-006` (casting landers from query review)  
**Audience:** Jeff (operator); outcomes may create casting/content backlog for Elyse

This is the **manual** measurement feedback loop. It is **not** replaced by the monthly ops scorecard’s automated visits / contacts / Studio counts (`OPS-P5-*`). App Insights answers “is Studio/prod healthy?”; GSC + GA4 answer “who finds us in search, where do they land, and do they inquire or download materials?”

Cadence: roughly the **1st of each month**, aligned with the ops scorecard ACS digest and [casting-discoverability.md](../plans/casting-discoverability.md) `DISC-P3-006`.

**Privacy:** Do not commit inquiry PII, raw export dumps with emails, or screenshots that include private contacts. Backlog notes in git stay high-level (paths, query themes, CTR gaps).

---

## Before you start

| Check | Where |
|-------|--------|
| GSC property for `elysetindall.com` | [Search Console](https://search.google.com/search-console) |
| GA4 property / Measurement ID `G-XEE29C0RRE` | [Analytics](https://analytics.google.com/) |
| Preferred host still apex | `www` → apex 301 ([dns-and-domain.md](dns-and-domain.md)) |
| Optional: last month’s scorecard activity | ACS digest / [`operational-excellence-scorecard.md`](../ops/operational-excellence-scorecard.md) § Site performance |

Residual one-time ops (not required every month): request indexing (`SEARCH-P0-004`), measurement-only GA Admin (`SEARCH-P1-005`), DebugView event verify.

---

## Monthly checklist (`SEARCH-P3-001`)

Work the previous **calendar month** (same window as the ops cost / site-performance probes).

| # | Source | Look at | Healthy if… | If not… |
|---|--------|---------|-------------|---------|
| 1 | **GSC → Performance** | Queries, CTR, impressions on `/for/*`, `/lessons`, brand vs non-brand | Brand queries healthy; non-brand landers not collapsing | Refine titles/descriptions or plan a new/refined lander (`DISC-P3-002`) |
| 2 | **GSC → Pages** (indexing) | Coverage errors; unexpected URLs (`/studio`, old WP paths) | No soft-404 / redirect loops; `/studio` not indexed | One-hop 301s / `noIndex` / sitemap filter ([staticwebapp.config.json](../../public/staticwebapp.config.json)) |
| 3 | **GA4 → Acquisition → Organic Search** | Landing pages, engagement | Money pages (`/`, `/materials`, `/shows`, `/for/*`) appear | Fix weak landers; promote strong ones in nav/home |
| 4 | **GA4 → Events** | `generate_lead`, `file_download`, `select_content` by landing page | Inquiries/downloads attach to intended landers | Prioritize content refresh on pages with traffic but no conversion |
| 5 | **GA4 ↔ GSC** (linked) | Query → page → conversion | Clear story for top queries | Decide content vs technical fix |
| 6 | **GSC → Experience / CWV** | LCP on hero/reel-heavy pages (mobile) | No new “poor” regressions after ship | Perf follow-up (`SEARCH-P3-003`) |
| 7 | **GSC → Enhancements** | Person, VideoObject, EducationalOrganization, Offer | No new critical schema errors | Rich Results Test before/after; schema in `Seo.astro` / page JSON-LD |

Mark `SEARCH-P3-001` done in [search-and-analytics.md](../plans/search-and-analytics.md) only after the checklist has been run at least once as a documented habit (then keep running monthly without flipping status back).

---

## Feed outcomes into the casting backlog (`SEARCH-P3-002`)

For each meaningful finding, either:

1. **Open or update a `DISC-*` item** in [casting-discoverability.md](../plans/casting-discoverability.md) (Tier 2–3 landers, title/description tweaks, Person facts), **or**
2. **Ship a small content PR** (new `/for/*` lander, copy fix) and reference the review month in the PR body.

Rules of thumb:

| Finding | Typical backlog action |
|---------|------------------------|
| High impressions, low CTR on a `/for/*` URL | Rewrite title/meta; keep bare title contract ([add-casting-page.md](add-casting-page.md)) |
| Query cluster with no lander | New casting page (`DISC-P3-002`) |
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

The monthly ACS digest / scorecard may include **visits, top paths, inquiry counts, Studio publishes** (`OPS-P5-*`). Use that as a thin activity glance. It does **not** include GSC queries, CTR, or indexing coverage — those stay in this runbook.

---

## Related

| Doc | Role |
|-----|------|
| [search-and-analytics.md](../plans/search-and-analytics.md) | `SEARCH-*` backlog + monthly loop table |
| [casting-discoverability.md](../plans/casting-discoverability.md) | `DISC-*` content backlog (`DISC-P3-006`) |
| [monthly-site-check-in.md](monthly-site-check-in.md) | How Elyse reads the ACS digest (not this GSC review) |
| [ga-data-api-access.md](ga-data-api-access.md) | Automating GA visits into the scorecard (ops) |
| [observability.md](observability.md) | App Insights vs GA4 |
