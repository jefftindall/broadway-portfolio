# Plan: Google Search Console & Analytics

**Artifact ID:** `ELYSE-SEARCH-001`  
**Version:** 1.15  
**Last updated:** 2026-08-10  
**Audience:** Agents, implementers, operators  
**Scope:** Google Search Console (GSC), Google Analytics 4 (GA4), and related technical SEO that makes those tools useful — not casting content strategy itself.

Use the **Action ID** column (`SEARCH-*`) to reference items in PRs, issues, and commits. Casting-intent content work stays in [casting-discoverability.md](casting-discoverability.md) (`DISC-*`); this plan owns the **measurement + console + technical SEO** track and links out to `DISC-*` where they overlap.

Example PR title: `SEARCH-P1-003: Add GA4 generate_lead on inquiry success`

**Status values:** `planned` · `in_progress` · `blocked` · `done` · `wont_fix`

---

## How to use this document

| Section | Purpose |
|---------|---------|
| [Status at a glance](#status-at-a-glance) | Done vs not done summary |
| [Roles](#roles) | What App Insights vs GA4 vs GSC own |
| [Current baseline](#current-baseline) | What the repo already has |
| [Phased backlog](#phased-backlog) | Implementable work with IDs and acceptance criteria |
| [Dependencies](#dependency-graph) | What blocks what |
| [Monthly operating loop](#monthly-operating-loop-search-ops) | How to use GSC + GA on an ongoing basis |
| [Out of scope](#out-of-scope) | Explicit non-goals |

Implement **one phase (or one `SEARCH-*` item) per PR** when practical. Prefer linking this doc from the PR body over pasting the full plan into the description.

---

## Status at a glance

| Phase / area | Status | Open residuals |
|--------------|--------|----------------|
| Phase 0 — Apex / GSC / GA4 property | `done` | `SEARCH-P0-004` request indexing (`planned`) |
| Phase 1 — GA4 measurement | Mostly `done` | `SEARCH-P1-005` Admin checklist (`planned`); DebugView verify under `SEARCH-P1-003`; `SEARCH-P1-006` `wont_fix` |
| Phase 2 — Technical SEO | `done` | — |
| Phase 3 — Monthly GSC+GA loop | `done` (runbook) | Habit ACs unchecked; **SoT is Phase 4 artifact** |
| Phase 4 — Automate monthly extract | Partial | `SEARCH-P4-001`/`002` `done` (runbook/workflow); residual: `SEARCH-P4-003`/`004` planned |

---

## Roles

| Tool | Job | Must not own |
|------|-----|--------------|
| **App Insights** | Studio publish/errors, availability, correlation IDs | Marketing funnels, organic query analysis |
| **GA4** | Public traffic, landing pages, conversion events, GSC association | Studio/ops diagnostics |
| **Search Console** | Indexing, queries, sitemap health, rich results, CWV | Product error triage |

GA must load only on **public** pages (never `/studio`). App Insights remains the Studio/ops source of truth ([observability.md](../runbooks/observability.md)).

---

## Current baseline

### Already in the repo (technical SEO)

| Capability | Where |
|------------|--------|
| Canonical site URL + sitemap | `astro.config.mjs` (`site`, `@astrojs/sitemap`; filters `/studio`, `/style-guide`) |
| robots.txt + sitemap pointer | `public/robots.txt` → `sitemap-index.xml` |
| Title / description / canonical / OG / Twitter / JSON-LD | `src/components/Seo.astro`, page-specific schema |
| Legacy WordPress 301s | `public/staticwebapp.config.json` (+ root mirror) — `DISC-P0-003` done |
| Studio help `noIndex` | `src/pages/studio/help.astro` |

### Shipped under this plan (Phase 1)

| Capability | Where | Action ID |
|------------|--------|-----------|
| GA4 Measurement ID as code (default `G-XEE29C0RRE`) | Terraform `ga_measurement_id` → GitHub `GA_MEASUREMENT_ID` → `PUBLIC_GA_MEASUREMENT_ID` | `SEARCH-P1-001` |
| Client gtag loader | `src/scripts/ga.ts`, `src/lib/analytics.ts`, `BaseLayout` | `SEARCH-P1-002` |
| Skip GA on Studio / `noindex` | Path + robots meta checks; `/studio` sets `noIndex` | `SEARCH-P1-002`, `SEARCH-P2-001` |
| Conversion / engagement events | `trackGaEvent` + inquiry / downloads / CTAs | `SEARCH-P1-003` |
| Privacy disclosure for GA | `src/pages/privacy.astro` | `SEARCH-P1-004` |
| Consent Mode banner | Skipped — measurement-only, no consent UI | `SEARCH-P1-006` (`wont_fix`) |

### Shipped under this plan (Phase 2)

| Capability | Where | Action ID |
|------------|--------|-----------|
| Single brand title suffix | Bare titles → `BaseLayout` appends ` · Elyse Tindall`; casting frontmatter stripped | `SEARCH-P2-002` |
| Person JSON-LD merge | `Seo.astro` prepends default Person when custom schema lacks top-level/`@graph` Person | `SEARCH-P2-003` |
| Compressed default OG + metas | `public/images/og-default.jpg` (1200×630 JPEG) + width/height/alt | `SEARCH-P2-004` |
| `Disallow: /studio` | `public/robots.txt` | `SEARCH-P2-005` |
| Slashless materials URLs | Materials JSON-LD + Hero/Footer hrefs | `SEARCH-P2-006` |
| SEO journey coverage | `tests/journeys/seo.spec.ts` (`J-SEO-01`); smoke Disallow check | `SEARCH-P2-007` |

### Live ops (already done)

| Capability | Notes | Former IDs |
|------------|-------|------------|
| Apex serves Astro SWA | `https://elysetindall.com/` + `sitemap-index.xml` live | `SEARCH-P0-001`, `DISC-P0-001` |
| GSC property for `elysetindall.com` | Registered / verified | `SEARCH-P0-002`, `DISC-P0-002` |
| GA4 property `elysetindall.com` | Collecting traffic; Measurement ID `G-XEE29C0RRE` | `SEARCH-P0-003` |
| Preferred host | Apex is canonical; Terraform binds `www` + Portal “Set as default” for www → apex 301 | `SEARCH-P0-005` |

### Still open under this plan

| Gap | Notes |
|-----|--------|
| GA Admin measurement-only settings | Operator checklist (`SEARCH-P1-005`) — not code |
| Conversion/event DebugView verification | Confirm once in GA4 after deploy (`SEARCH-P1-003` acceptance) |
| Request indexing for key Astro URLs | Remaining Phase 0 item (`SEARCH-P0-004`) |
| Monthly GSC+GA review habit | Runbook done (`SEARCH-P3-*`); **automate** via `SEARCH-P4-*` (manual will not stick) |
| Optional Bing Webmaster sitemap | Nice-to-have; not blocking |

---

## Phased backlog

### Phase 0 — Ops residual

Apex cutover, GSC registration, and GA4 property setup are **done** (see [Live ops](#live-ops-already-done)). Only residual console hygiene remains.

| ID | Title | Status | Depends on | Primary refs |
|----|-------|--------|------------|--------------|
| `SEARCH-P0-004` | Request indexing for money pages after Astro URLs stabilize | `planned` | — | GSC URL Inspection; `/`, `/materials`, `/shows`, key `/for/*` |

<details>
<summary><code>SEARCH-P0-004</code> — Request indexing</summary>

**Acceptance criteria**

- [ ] URL Inspection + “Request indexing” for `/`, `/materials`, `/shows`
- [ ] Same for top `/for/*` landers (at least the homepage-linked / highest-intent ones)
- [ ] No soft-404 / redirect-error surprises; fix with one-hop 301s if needed
- [ ] (Optional) Bing Webmaster Tools sitemap submitted

Confirm `www.elysetindall.com` still 301s to the apex after any domain change ([dns-and-domain.md](../runbooks/dns-and-domain.md)).

</details>

---

### Phase 1 — GA4 site integration

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `SEARCH-P1-001` | Provision Measurement ID as Terraform → GitHub env → Astro build | `done` | — | `infra/modules/portfolio/{variables,github_actions}.tf`, env stacks, workflows, `.env.example` |
| `SEARCH-P1-002` | Load gtag on public pages; skip Studio / noindex | `done` | `SEARCH-P1-001` | `src/lib/analytics.ts`, `src/scripts/ga.ts`, `src/layouts/BaseLayout.astro` |
| `SEARCH-P1-003` | Define conversion / engagement events | `done` | `SEARCH-P1-002` | Inquiry forms, materials downloads, reel/materials CTAs |
| `SEARCH-P1-004` | Privacy disclosure for Analytics | `done` | `SEARCH-P1-002` | `src/pages/privacy.astro` |
| `SEARCH-P1-005` | Keep GA measurement-only (no ads/signals unless chosen) | `planned` | — | GA Admin property settings (ops checklist below) |
| `SEARCH-P1-006` | Optional Consent Mode v2 + minimal consent UI | `wont_fix` | `SEARCH-P1-002` | Staying measurement-only without a consent banner |

<details>
<summary><code>SEARCH-P1-001</code> — Measurement ID as code</summary>

**Acceptance criteria**

- [x] Terraform `ga_measurement_id` default `G-XEE29C0RRE`
- [x] GitHub Environment variable `GA_MEASUREMENT_ID` managed when `manage_github_actions` is true
- [x] Staging/prod deploy workflows set `PUBLIC_GA_MEASUREMENT_ID`
- [x] Client falls back to `G-XEE29C0RRE` when env empty
- [ ] Staging/prod Terraform applied so GitHub env vars exist in the remote Environments

**Override:** `terraform apply -var='ga_measurement_id=G-…'` then redeploy.

</details>

<details>
<summary><code>SEARCH-P1-002</code> — Client loader</summary>

**Acceptance criteria**

- [x] Public pages initialize gtag with the configured Measurement ID
- [x] `/studio` and `/studio/*` do not send GA hits
- [x] Pages with `noindex` (e.g. style-guide, studio help) do not send GA hits
- [x] Documented in [observability.md](../runbooks/observability.md)

</details>

<details>
<summary><code>SEARCH-P1-003</code> — Events</summary>

**Acceptance criteria**

Keep the event set small and stable:

| Event | When | Parameters |
|-------|------|------------|
| `generate_lead` | Casting / lesson inquiry submit **success** | `form_type`: `casting` \| `lesson` |
| `file_download` | Resume PDF / headshot download click | `file_name`, `file_extension`, `link_url`, `link_text` |
| `select_content` | Primary reel / materials CTA click | `content_type`: `reel` \| `materials`; `content_id` (e.g. `watch-reel`, `request-materials`) |

- [x] Events fire once per user action (form bind guard; click = one event)
- [x] Documented parameter names in this plan and [observability.md](../runbooks/observability.md)
- [ ] Verified in GA4 DebugView (post-deploy operator check)
- [x] Still **no** Studio events in GA (`shouldLoadGa` / noindex skip unchanged)

**Implementation**

- `trackGaEvent` in `src/lib/analytics.ts`
- Inquiry success → `generate_lead` from `InquiryForm.astro`
- Downloads / CTAs → `data-ga-event` attributes + delegated click handler in `src/scripts/ga.ts`

</details>

<details>
<summary><code>SEARCH-P1-004</code> — Privacy</summary>

**Acceptance criteria**

- [x] `/privacy` states that public pages use Google Analytics 4
- [x] Notes Studio exclusion and no ad personalization intent on this site
- [x] Sharing section mentions Google Analytics as a processor for analytics events

</details>

<details>
<summary><code>SEARCH-P1-005</code> — Measurement-only GA Admin</summary>

**Acceptance criteria**

- [ ] Google signals / ads personalization features left off unless explicitly enabled later
- [ ] Data retention and timezone set appropriately for the property
- [x] Noted in ops checklist ([observability.md](../runbooks/observability.md) § GA4 property settings)

**Operator checklist** (GA4 Admin for `elysetindall.com` / `G-XEE29C0RRE`)

1. **Data collection** → Google signals: leave **off** (no ads personalization).
2. **Data retention**: event data retention at least **14 months** (or team preference); reset on new activity as desired.
3. **Property settings** → Reporting time zone: **America/New_York** (business locale).
4. **Data streams** → Web stream → Enhanced measurement: keep useful defaults; do not enable ads features.
5. Mark this item `done` in the Phase 1 table when verified.

</details>

<details>
<summary><code>SEARCH-P1-006</code> — Consent Mode (optional)</summary>

**Status:** `wont_fix` — staying measurement-only without a consent banner. Privacy copy already states Analytics use and no ad personalization intent. Reopen only if product/legal requires a consent gate.

**Acceptance criteria** (only if we choose to ship consent UI later)

- [ ] Default `analytics_storage` denied until accept (Consent Mode v2)
- [ ] Accept enables GA; reject keeps it denied
- [ ] Privacy page updated for the consent mechanism
- [ ] No consent banner on `/studio`

</details>

---

### Phase 2 — Technical SEO polish (makes GSC cleaner)

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `SEARCH-P2-001` | `noIndex` on `/studio` | `done` | — | `src/pages/studio.astro` |
| `SEARCH-P2-002` | Fix duplicated casting titles (`\|` + `· Elyse Tindall`) | `done` | — | Casting frontmatter / `LandingLayout` / `BaseLayout` |
| `SEARCH-P2-003` | Merge custom JSON-LD with default Person (don’t replace) | `done` | — | `src/components/Seo.astro`, page schemas |
| `SEARCH-P2-004` | Compress default OG image + width/height/alt | `done` | — | `public/images/og-default.jpg`, `Seo.astro` |
| `SEARCH-P2-005` | Optional `Disallow: /studio` in robots.txt | `done` | — | `public/robots.txt` |
| `SEARCH-P2-006` | Align slashless canonicals (e.g. materials JSON-LD trailing slash) | `done` | — | Page JSON-LD URLs vs canonicals |
| `SEARCH-P2-007` | Journey/smoke coverage for SEO basics | `done` | — | `tests/journeys/seo.spec.ts` (`J-SEO-01`); smoke robots Disallow |

<details>
<summary><code>SEARCH-P2-002</code> — Casting titles</summary>

**Acceptance criteria**

- [x] Public casting pages render a single brand suffix (no `Title \| Elyse Tindall · Elyse Tindall`)
- [x] `<title>` and `og:title` match the intended SERP string
- [x] Frontmatter / layout contract documented (who owns the brand suffix)

**Contract:** Pages pass bare titles; `BaseLayout` appends ` · Elyse Tindall` (also strips legacy `| Name`). See [add-casting-page.md](../runbooks/add-casting-page.md).

</details>

<details>
<summary><code>SEARCH-P2-003</code> — Person JSON-LD merge</summary>

**Acceptance criteria**

- [x] Pages that pass custom `jsonLd` still expose a coherent Person (or `@graph` including Person) where appropriate
- [x] Home / lessons / shows schemas remain valid in Rich Results Test
- [x] No duplicate conflicting `@id`s for the same person

`Seo.astro` prepends `defaultPerson` when custom nodes lack a top-level or `@graph` Person. Nested `about` / `founder` do not suppress the default.

Cross-link content enrichment: `DISC-P1-004` (alumniOf, YouTube `sameAs`, performer facts).

</details>

<details>
<summary><code>SEARCH-P2-004</code> — OG default image</summary>

**Acceptance criteria**

- [x] Default OG asset reasonably sized for social/crawlers (aim well under ~300KB unless quality requires more)
- [x] `og:image:width`, `og:image:height`, and `og:image:alt` (or equivalent) present for the default image path

Asset: 1200×630 JPEG at `/images/og-default.jpg`. Width/height metas only for the default path; `og:image:alt` always set.

</details>

<details>
<summary><code>SEARCH-P2-005</code> — robots.txt Disallow</summary>

**Acceptance criteria**

- [x] `Disallow: /studio` in `public/robots.txt` (complements sitemap filter + `noIndex`)

</details>

<details>
<summary><code>SEARCH-P2-006</code> — Slashless canonicals</summary>

**Acceptance criteria**

- [x] Materials JSON-LD `url` uses `/materials` (no trailing slash)
- [x] Primary in-site Materials hrefs prefer slashless form

</details>

<details>
<summary><code>SEARCH-P2-007</code> — SEO journey coverage</summary>

**Acceptance criteria**

- [x] `J-SEO-01` in `tests/journeys/seo.spec.ts` (title/canonical/OG; no double-brand casting title; robots Disallow; sitemap excludes `/studio`)
- [x] Smoke asserts `Disallow: /studio`

</details>

---

### Phase 3 — Operating loop + content feedback

| ID | Title | Status | Depends on | Primary refs |
|----|-------|--------|------------|--------------|
| `SEARCH-P3-001` | Monthly GSC + GA joint review | `done` (runbook) → automate via `SEARCH-P4-*` | `SEARCH-P1-003` (events make the loop more useful) | [search-ops-monthly.md](../runbooks/search-ops-monthly.md); extends `DISC-P3-006` |
| `SEARCH-P3-002` | Feed review outcomes into casting/content backlog | `done` (runbook) → automate via `DISC-P4-003`/`004` | `SEARCH-P3-001` / `SEARCH-P4-002` | Same runbook; [casting-discoverability.md](casting-discoverability.md) Tier 2–4 |
| `SEARCH-P3-003` | Re-check CWV / Experience in GSC after major visual changes | `done` (runbook) | — | Same runbook; hero/reel pages especially |

**Phase 3 repo delivery:** runbook + cross-links shipped. **Operator reality:** the manual checklist for `SEARCH-P3-001` will not happen reliably — treat **`SEARCH-P4-*` as required**, not optional polish. Until Phase 4 ships, the runbook remains the fallback.

<details>
<summary><code>SEARCH-P3-001</code> — Monthly GSC + GA joint review</summary>

**Acceptance criteria**

- [x] Operator checklist documented in [search-ops-monthly.md](../runbooks/search-ops-monthly.md) (GSC Performance/Pages/CWV/Enhancements + GA Acquisition/Events + GA↔GSC)
- [x] Cadence aligned with monthly ops scorecard / `DISC-P3-006` (roughly 1st of month)
- [ ] Checklist executed at least once in production ops (habit; **SoT is** `SEARCH-P4-002` artifact under [`docs/ops/search-signals/`](../ops/search-signals/))
- [x] Automation track opened: `SEARCH-P4-001` / `SEARCH-P4-002` (required)

</details>

<details>
<summary><code>SEARCH-P3-002</code> — Feed outcomes into casting backlog</summary>

**Acceptance criteria**

- [x] Runbook rule: meaningful findings → `DISC-*` item or content PR (Tier 2–3 / `/for/*`)
- [x] Privacy: no inquiry PII or full query-export dumps with emails in git
- [x] Cross-linked from `DISC-P3-006`
- [ ] Automated handoff: signal artifact → `DISC-P4-003` / draft PR `DISC-P4-004` (Tier 4)

</details>

<details>
<summary><code>SEARCH-P3-003</code> — CWV after major visual changes</summary>

**Acceptance criteria**

- [x] Runbook step to re-check GSC Experience/CWV after hero/reel ships
- [x] Points at perf/RUM follow-ups when field CWV regresses

</details>

Content that moves rankings (Person facts, `/for/*` landers, materials downloads, news cadence) remains owned by **`DISC-*`** (including Tier 4 draft automation). This phase is the **measurement feedback loop** into that backlog.

**Scorecard automation (ops-owned):** Monthly visits, top pages, contact counts, and Studio update counts in the ops scorecard are **`OPS-P5-*`** in [operational-excellence.md](operational-excellence.md) — hybrid **GA4 Data API** (visits/top pages) + **App Insights** (contacts/updates). That does **not** replace GSC query/CTR extraction — `SEARCH-P4-*` owns that. GA Data API setup: [ga-data-api-access.md](../runbooks/ga-data-api-access.md) (`OPS-P5-002`).

---

### Phase 4 — Automate the monthly GSC + GA review (`SEARCH-P3-001`)

**Goal:** Scheduled extraction of the signals in [search-ops-monthly.md](../runbooks/search-ops-monthly.md) so Jeff does not have to click through consoles. **No Gemini required** for extraction/ranking. When lander **bodies** are drafted (`DISC-P4-004`), use **`GEMINI_MODEL_SEARCH_OPS`** (`gemini-3.5-flash`) — **not** Studio’s `GEMINI_MODEL` (`gemini-3.6-flash`). Those models have **independent** 5 RPM / 20 RPD pools; see casting Tier 4 `DISC-P4-000` and [cost-and-quotas.md](../runbooks/cost-and-quotas.md).

| ID | Title | Status | Depends on | Primary refs |
|----|-------|--------|------------|--------------|
| `SEARCH-P4-001` | GSC Search Analytics API access (SA + KV secret) | `done` (runbook) | GSC property (`SEARCH-P0-002` / `DISC-P0-002`) | [gsc-data-api-access.md](../runbooks/gsc-data-api-access.md); `GSC-SITE-URL` / `GSC-DATA-API-SA-JSON` in `kv-elyse-shared` — never commit JSON |
| `SEARCH-P4-002` | Monthly workflow (1st): GSC queries/pages/CTR + GA landings → signal artifact | `done` | `SEARCH-P4-001`; GA SA (`OPS-P5-002`) preferred | `.github/workflows/search-ops-monthly.yml` (1st, 13:00 UTC — before ops scorecard); [`docs/ops/search-signals/`](../ops/search-signals/); themes/paths only in git |
| `SEARCH-P4-003` | Operator digest / PR comment summarizing gaps (still no Gemini) | `planned` | `SEARCH-P4-002` | ACS email to `ALERT-EMAIL` and/or PR on draft branch; no PII |
| `SEARCH-P4-004` | Hand off candidates to casting pipeline | `planned` | `SEARCH-P4-002`; `DISC-P4-003` | [casting-discoverability.md](casting-discoverability.md) Tier 4 |

<details>
<summary><code>SEARCH-P4-001</code> — GSC API access</summary>

**Acceptance criteria**

- [x] Runbook + bootstrap KV placeholders for SA reuse (GA scorecard SA) or dedicated `GSC-DATA-API-SA-JSON`
- [x] Credentials in Key Vault only (`ignore_changes`); rotate per [rotate-secrets.md](../runbooks/rotate-secrets.md)
- [x] Runbook steps to grant GSC user on the property — live grant is **Full** (indexing-capable; Restricted is usually enough for Search Analytics alone) ([gsc-data-api-access.md](../runbooks/gsc-data-api-access.md))
- [x] Local dry-run / fixture mode prints **counts/themes only** — never dumps full query tables into logs (`npm run search:signals:fixture`)
- [x] Operator: SA granted on live GSC property (**Full**, for Search Analytics + future indexing helpers)
- [x] `GSC-SITE-URL` defaults to `https://elysetindall.com/` when KV is missing/`REPLACE_ME` (bootstrap seed + fetch/refresh fallback); optional KV override still supported

</details>

<details>
<summary><code>SEARCH-P4-002</code> — Monthly signal artifact</summary>

**Acceptance criteria**

- [x] Scheduled job (1st of month, 13:00 UTC — before ops scorecard at 14:00) pulls **since last run** (else 28-day lookback): top queries, `/for/*` CTR/impressions bands, indexing anomalies summary, GA organic landing paths
- [x] Writes a small artifact (JSON/MD) under [`docs/ops/search-signals/`](../ops/search-signals/) (`latest.*` + `{from}_{to}.*`): **paths, query themes, numeric bands** — no emails, no full raw exports
- [x] Commit step uses `git status --porcelain` so **new untracked** artifacts are pushed (not `git diff`, which skipped first-run files)
- [x] Push uses [`scripts/git-push-main-rebase.sh`](../../scripts/git-push-main-rebase.sh) (fetch + `rebase --autostash` + retry; no force-push) so concurrent `main` merges during GSC/GA probes do not fail the job (and incidental `chmod +x` dirt cannot block rebase)
- [x] Covers checklist rows 1–5 of [search-ops-monthly.md](../runbooks/search-ops-monthly.md) at minimum (CWV/Enhancements stay manual)
- [x] **Zero Gemini calls** in this job
- [x] Failure notifies `ALERT-EMAIL` only (reuses `ops-scorecard-failure-email.mjs`)
- [ ] First production month with populated GSC/GA secrets confirmed (operator residual; re-run workflow after commit-detection fix)

</details>

<details>
<summary><code>SEARCH-P4-003</code> — Operator digest</summary>

**Acceptance criteria**

- [ ] Human-readable summary of gaps (high impressions/low CTR, missing lander themes, weak conversion landings)
- [ ] Links to open `DISC-*` / next draft PR when present
- [ ] Does not replace Elyse’s ACS scorecard digests; may be ALERT-only

</details>

<details>
<summary><code>SEARCH-P4-004</code> — Handoff to DISC Tier 4</summary>

**Acceptance criteria**

- [ ] Artifact schema documented for `DISC-P4-003` consumer
- [ ] Cross-links from casting Tier 4 and [search-ops-monthly.md](../runbooks/search-ops-monthly.md)
- [ ] Lander **body** generation remains `DISC-P4-004` (Gemini-capped); this ID only hands off ranked candidates

</details>

---

## Dependency graph

```text
Phase 0 done: apex + GSC property + GA4 property (+ preferred host = apex)

SEARCH-P0-004 (request indexing) ── residual ops

SEARCH-P1-001 (Measurement ID IaC) ── done (pending apply/deploy if env var missing)
    └── SEARCH-P1-002 (gtag) ── done
            ├── SEARCH-P1-003 (events) ── done (DebugView verify post-deploy)
            ├── SEARCH-P1-004 (privacy) ── done
            ├── SEARCH-P1-005 (measurement-only admin) ── planned (ops)
            └── SEARCH-P1-006 (consent) ── wont_fix

SEARCH-P2-* (SEO polish) — done in repo
SEARCH-P3-001 (monthly review runbook) ── insufficient alone
    └── SEARCH-P4-001 (GSC API SA)
            └── SEARCH-P4-002 (signal artifact, no Gemini)
                    ├── SEARCH-P4-003 (operator digest)
                    └── SEARCH-P4-004 → DISC-P4-003 → DISC-P4-004 (casting drafts, Gemini-capped)
```

---

## Monthly operating loop (`SEARCH-OPS`)

GSC and GA4 properties are live. **SoT:** automated `SEARCH-P4-002` artifact under [`docs/ops/search-signals/`](../ops/search-signals/) (monthly; + optional digest via `SEARCH-P4-003`). **Fallback:** manual checklist in [search-ops-monthly.md](../runbooks/search-ops-monthly.md) (aligned with `DISC-P3-006`).

| Source | Look at | Action |
|--------|---------|--------|
| GSC Performance | Queries, CTR, impressions on `/for/*`, `/lessons`, brand vs non-brand | Refine titles/descriptions or new/refined casting landers (`DISC-P3-002` / `DISC-P4-004`) |
| GSC Pages | Coverage errors, unexpected URLs (`/studio`, old WP paths) | 301s / `noIndex` / sitemap filter |
| GA4 Acquisition → Organic Search | Landing pages, engagement | Fix weak landers; promote strong ones in nav/home |
| GA4 Events | Inquiry / download conversion by landing page | Prioritize content refresh |
| GA4 ↔ GSC (linked) | Query → page → conversion | Decide content vs technical fix |
| GSC Experience / CWV | LCP on hero/reel-heavy pages, mobile | Perf follow-ups (`SEARCH-P3-003`) |
| GSC Enhancements | Person, VideoObject, EducationalOrganization, Offer | Fix schema; Rich Results Test before/after |

**Rule of thumb:** App Insights answers “is Studio/prod healthy?”; GA4 + GSC answer “who finds us in search, where do they land, and do they inquire or download materials?” Operator checklist: [search-ops-monthly.md](../runbooks/search-ops-monthly.md). Casting lander automation: [casting-discoverability.md](casting-discoverability.md) Tier 4. The monthly ops scorecard mirrors a thin slice (visits / top paths from GA; contacts / Studio updates from App Insights) under `OPS-P5-*` — see [operational-excellence.md](operational-excellence.md) § Site performance.

---

## Out of scope

- Replacing App Insights with GA for Studio/ops telemetry
- Keyword-stuffed titles/descriptions “for GSC”
- Advertising / remarketing configuration (unless a future decision flips `SEARCH-P1-005`)
- Using Gemini inside `SEARCH-P4-002` extraction (budget reserved for Studio `GEMINI_MODEL` + search-ops `GEMINI_MODEL_SEARCH_OPS` bodies)
- Pointing lander draft jobs at Studio’s `GEMINI_MODEL` / 3.6 Flash (use `GEMINI_MODEL_SEARCH_OPS` / 3.5 instead)
- Scraping paid casting boards for keywords (licensed ingest is `DISC-P4-008` in casting Tier 4 — never unlicensed scrape)
- Broadway casting-agent keyword **discovery** (curated + public news `DISC-P4-007`, licensed later `DISC-P4-008`) — GSC extract is site-demand **feedback** only
- Full casting content strategy — see [casting-discoverability.md](casting-discoverability.md)
- Assuming sitemap submission alone ranks `/for/*` landers — index pipeline ≠ ranking lever

---

## Suggested implementation order

1. **Phase 0** — Apex / GSC / GA4 registration — **done**; residual: request indexing (`SEARCH-P0-004`)
2. **Phase 1a** — Measurement ID + loader + privacy — **done** (`SEARCH-P1-001`, `002`, `004`)
3. **Phase 1b** — Conversion events — **done in repo** (`SEARCH-P1-003`); Consent Mode — **wont_do** (`SEARCH-P1-006`); residual ops: measurement-only GA Admin (`SEARCH-P1-005`) + DebugView verify
4. **Phase 2** — SEO polish — **done** (`SEARCH-P2-001`–`007`)
5. **Phase 3** — Monthly loop runbook → feed `DISC-*` — **done in repo** ([search-ops-monthly.md](../runbooks/search-ops-monthly.md)); SoT is Phase 4 artifact
6. **Phase 4** — Automate `SEARCH-P3-001`: `SEARCH-P4-001`/`002` **done** (runbook + workflow); next `SEARCH-P4-003`/`004` → casting Tier 4 (`DISC-P4-003`/`004`)

---

## Related documents

| Doc | Relationship |
|-----|----------------|
| [casting-discoverability.md](casting-discoverability.md) | Casting SEO backlog (`DISC-*`); Tier 4 lander pipeline consumes `SEARCH-P4` signals; Broadway keyword discovery is `DISC-P4-007`/`008` |
| [search-ops-monthly.md](../runbooks/search-ops-monthly.md) | Phase 3 checklist; Phase 4 SoT is [`docs/ops/search-signals/`](../ops/search-signals/) |
| [wordpress-to-azure-cutover.md](../runbooks/wordpress-to-azure-cutover.md) §6 | Historical cutover checklist; residual indexing in `SEARCH-P0-004` |
| [dns-and-domain.md](../runbooks/dns-and-domain.md) | Apex / www |
| [operational-excellence.md](operational-excellence.md) | Monthly scorecard; `OPS-P5-*` site performance (GA visits/top pages + App Insights contacts/updates) |
| [ga-data-api-access.md](../runbooks/ga-data-api-access.md) | GA Data API KV secrets for scorecard (`OPS-P5-002`); prefer reuse for GSC |
| [gsc-data-api-access.md](../runbooks/gsc-data-api-access.md) | GSC Search Analytics SA + `GSC-SITE-URL` (`SEARCH-P4-001`) |
| [cost-and-quotas.md](../runbooks/cost-and-quotas.md) | Azure budget + Gemini RPM/RPD for Studio + lander drafts |
| [observability.md](../runbooks/observability.md) | App Insights vs GA4 |
| [rotate-secrets.md](../runbooks/rotate-secrets.md) | GA Measurement ID; GA/GSC Data API SA JSON |
| [add-casting-page.md](../runbooks/add-casting-page.md) | New `/for/*` landers (sitemap inclusion); bare title contract |
| [ux-release-testing-strategy.md](ux-release-testing-strategy.md) | `J-SEO-01` implemented (`tests/journeys/seo.spec.ts`) |
| [AGENTS.md](../../AGENTS.md) | Agent-facing Phase 1/2 SEO & analytics contracts |
| [.cursor/rules/search-seo.mdc](../../.cursor/rules/search-seo.mdc) | Keep plan + AGENTS in sync on SEO/GA changes |
