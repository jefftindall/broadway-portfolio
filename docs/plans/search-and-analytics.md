# Plan: Google Search Console & Analytics

**Artifact ID:** `ELYSE-SEARCH-001`  
**Version:** 1.0  
**Last updated:** 2026-08-06  
**Audience:** Agents, implementers, operators  
**Scope:** Google Search Console (GSC), Google Analytics 4 (GA4), and related technical SEO that makes those tools useful — not casting content strategy itself.

Use the **Action ID** column (`SEARCH-*`) to reference items in PRs, issues, and commits. Casting-intent content work stays in [casting-discoverability.md](../casting-discoverability.md) (`DISC-*`); this plan owns the **measurement + console + technical SEO** track and links out to `DISC-*` where they overlap.

Example PR title: `SEARCH-P1-003: Add GA4 generate_lead on inquiry success`

**Status values:** `planned` · `in_progress` · `blocked` · `done` · `wont_fix`

---

## How to use this document

| Section | Purpose |
|---------|---------|
| [Roles](#roles) | What App Insights vs GA4 vs GSC own |
| [Current baseline](#current-baseline) | What the repo already has |
| [Phased backlog](#phased-backlog) | Implementable work with IDs and acceptance criteria |
| [Dependencies](#dependency-graph) | What blocks what |
| [Monthly operating loop](#monthly-operating-loop-search-ops) | How to use GSC + GA after cutover |
| [Out of scope](#out-of-scope) | Explicit non-goals |

Implement **one phase (or one `SEARCH-*` item) per PR** when practical. Prefer linking this doc from the PR body over pasting the full plan into the description.

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

### Shipped under this plan (Phase 1 partial)

| Capability | Where | Action ID |
|------------|--------|-----------|
| GA4 Measurement ID as code (default `G-XEE29C0RRE`) | Terraform `ga_measurement_id` → GitHub `GA_MEASUREMENT_ID` → `PUBLIC_GA_MEASUREMENT_ID` | `SEARCH-P1-001` |
| Client gtag loader | `src/scripts/ga.ts`, `src/lib/analytics.ts`, `BaseLayout` | `SEARCH-P1-002` |
| Skip GA on Studio / `noindex` | Path + robots meta checks; `/studio` sets `noIndex` | `SEARCH-P1-002`, `SEARCH-P2-001` |
| Privacy disclosure for GA | `src/pages/privacy.astro` | `SEARCH-P1-004` |

### Still operational / blocked on apex

| Gap | Notes |
|-----|--------|
| Apex still WordPress until `DISC-P0-001` | GSC/GA on the real hostname wait on cutover |
| GSC verify + sitemap submit | `DISC-P0-002` / `SEARCH-P0-002` |
| GSC ↔ GA4 product link | `SEARCH-P0-003` |
| Conversion events, SEO polish, monthly loop | Phases 1b–3 below |

---

## Phased backlog

### Phase 0 — Ops unlock (blockers)

Do first after (or as part of) apex cutover. Mostly operator work; little/no app code.

| ID | Title | Status | Depends on | Primary refs |
|----|-------|--------|------------|--------------|
| `SEARCH-P0-001` | Serve Astro on apex (`elysetindall.com`) | `planned` | — | Same as `DISC-P0-001`; [wordpress-to-azure-cutover.md](../runbooks/wordpress-to-azure-cutover.md), [dns-and-domain.md](../runbooks/dns-and-domain.md) |
| `SEARCH-P0-002` | Verify GSC Domain property + submit sitemap (+ Bing) | `planned` | `SEARCH-P0-001` | Same as `DISC-P0-002`; cutover §6 |
| `SEARCH-P0-003` | Create/confirm GA4 web stream + link GSC ↔ GA4 | `planned` | `SEARCH-P0-001`, `SEARCH-P1-001` | GA Admin + GSC Associations; Measurement ID `G-XEE29C0RRE` |
| `SEARCH-P0-004` | Request indexing for money pages | `planned` | `SEARCH-P0-002` | `/`, `/materials`, `/shows`, key `/for/*` |
| `SEARCH-P0-005` | Ensure www → apex (or single preferred host) | `planned` | `SEARCH-P0-001` | [dns-and-domain.md](../runbooks/dns-and-domain.md); avoid split GSC signals |

<details>
<summary><code>SEARCH-P0-001</code> — Apex serves Astro</summary>

**Acceptance criteria** — mirror `DISC-P0-001`:

- [ ] `https://elysetindall.com/` serves the Astro build
- [ ] `https://elysetindall.com/sitemap-index.xml` returns 200
- [ ] HTTPS valid on apex

Keep a single source of cutover steps in the WordPress cutover runbook; mark both IDs done when cutover completes.

</details>

<details>
<summary><code>SEARCH-P0-002</code> — GSC (+ Bing) sitemap</summary>

**Acceptance criteria**

- [ ] GSC **Domain** property verified for `elysetindall.com`
- [ ] Sitemap `https://elysetindall.com/sitemap-index.xml` submitted and accepted
- [ ] Bing Webmaster Tools sitemap submitted (recommended)
- [ ] Index coverage for `/for/*` monitored for ~2 weeks post-cutover

</details>

<details>
<summary><code>SEARCH-P0-003</code> — GA4 property + GSC link</summary>

**Acceptance criteria**

- [ ] GA4 property / web data stream exists for `elysetindall.com`
- [ ] Measurement ID matches provisioned value (`G-XEE29C0RRE` unless rotated)
- [ ] GSC ↔ GA4 association enabled (reports visible in both products)
- [ ] Realtime (or DebugView) shows a hit from a public production URL

**Note:** Do not put GA secrets in Key Vault — the Measurement ID is public-by-design. Rotation: [rotate-secrets.md](../runbooks/rotate-secrets.md) § Google Analytics 4.

</details>

<details>
<summary><code>SEARCH-P0-004</code> — Request indexing</summary>

**Acceptance criteria**

- [ ] URL Inspection + “Request indexing” for `/`, `/materials`, `/shows`
- [ ] Same for top `/for/*` landers (at least the homepage-linked / highest-intent ones)
- [ ] No soft-404 / redirect-error surprises; fix with one-hop 301s if needed

</details>

<details>
<summary><code>SEARCH-P0-005</code> — Preferred host</summary>

**Acceptance criteria**

- [ ] One canonical hostname in practice (prefer apex)
- [ ] Other hostname 301s to preferred (or is not publicly serving duplicate content)
- [ ] GSC Domain property covers both

</details>

---

### Phase 1 — GA4 site integration

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `SEARCH-P1-001` | Provision Measurement ID as Terraform → GitHub env → Astro build | `done` | — | `infra/modules/portfolio/{variables,github_actions}.tf`, env stacks, workflows, `.env.example` |
| `SEARCH-P1-002` | Load gtag on public pages; skip Studio / noindex | `done` | `SEARCH-P1-001` | `src/lib/analytics.ts`, `src/scripts/ga.ts`, `src/layouts/BaseLayout.astro` |
| `SEARCH-P1-003` | Define conversion / engagement events | `planned` | `SEARCH-P1-002` | Inquiry forms, materials downloads, reel CTA |
| `SEARCH-P1-004` | Privacy disclosure for Analytics | `done` | `SEARCH-P1-002` | `src/pages/privacy.astro` |
| `SEARCH-P1-005` | Keep GA measurement-only (no ads/signals unless chosen) | `planned` | `SEARCH-P0-003` | GA Admin property settings |
| `SEARCH-P1-006` | Optional Consent Mode v2 + minimal consent UI | `planned` | `SEARCH-P1-002` | Only if product/legal wants consent gate |

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

| Event | When |
|-------|------|
| `generate_lead` | Casting / lesson inquiry submit **success** |
| `file_download` | Resume PDF (and later headshot) download |
| `select_content` | Primary reel play / materials CTA (as applicable) |

- [ ] Events fire once per user action (no double-count on remount)
- [ ] Documented parameter names (e.g. `form_type`, `file_name`) in this plan or observability
- [ ] Verified in GA4 DebugView
- [ ] Still **no** Studio events in GA

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
- [ ] Noted in ops checklist when `SEARCH-P0-003` is completed

</details>

<details>
<summary><code>SEARCH-P1-006</code> — Consent Mode (optional)</summary>

**Acceptance criteria** (only if we choose to ship consent UI)

- [ ] Default `analytics_storage` denied until accept (Consent Mode v2)
- [ ] Accept enables GA; reject keeps it denied
- [ ] Privacy page updated for the consent mechanism
- [ ] No consent banner on `/studio`

If we stay measurement-only without a banner, mark this `wont_fix` and keep Privacy accurate.

</details>

---

### Phase 2 — Technical SEO polish (makes GSC cleaner)

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `SEARCH-P2-001` | `noIndex` on `/studio` | `done` | — | `src/pages/studio.astro` |
| `SEARCH-P2-002` | Fix duplicated casting titles (`\|` + `· Elyse Tindall`) | `planned` | — | Casting frontmatter / `LandingLayout` / `BaseLayout` |
| `SEARCH-P2-003` | Merge custom JSON-LD with default Person (don’t replace) | `planned` | — | `src/components/Seo.astro`, page schemas |
| `SEARCH-P2-004` | Compress default OG image + width/height/alt | `planned` | — | `public/images/og-default.jpg`, `Seo.astro` |
| `SEARCH-P2-005` | Optional `Disallow: /studio` in robots.txt | `planned` | — | `public/robots.txt` |
| `SEARCH-P2-006` | Align slashless canonicals (e.g. materials JSON-LD trailing slash) | `planned` | — | Page JSON-LD URLs vs canonicals |
| `SEARCH-P2-007` | Journey/smoke coverage for SEO basics | `planned` | — | Planned `J-SEO-01` in [ux-release-testing-strategy.md](ux-release-testing-strategy.md); smoke already checks robots/sitemap |

<details>
<summary><code>SEARCH-P2-002</code> — Casting titles</summary>

**Acceptance criteria**

- [ ] Public casting pages render a single brand suffix (no `Title \| Elyse Tindall · Elyse Tindall`)
- [ ] `<title>` and `og:title` match the intended SERP string
- [ ] Frontmatter / layout contract documented (who owns the brand suffix)

</details>

<details>
<summary><code>SEARCH-P2-003</code> — Person JSON-LD merge</summary>

**Acceptance criteria**

- [ ] Pages that pass custom `jsonLd` still expose a coherent Person (or `@graph` including Person) where appropriate
- [ ] Home / lessons / shows schemas remain valid in Rich Results Test
- [ ] No duplicate conflicting `@id`s for the same person

Cross-link content enrichment: `DISC-P1-004` (alumniOf, YouTube `sameAs`, performer facts).

</details>

<details>
<summary><code>SEARCH-P2-004</code> — OG default image</summary>

**Acceptance criteria**

- [ ] Default OG asset reasonably sized for social/crawlers (aim well under ~300KB unless quality requires more)
- [ ] `og:image:width`, `og:image:height`, and `og:image:alt` (or equivalent) present for the default image path

</details>

---

### Phase 3 — Operating loop + content feedback

| ID | Title | Status | Depends on | Primary refs |
|----|-------|--------|------------|--------------|
| `SEARCH-P3-001` | Monthly GSC + GA joint review | `planned` | `SEARCH-P0-002`, `SEARCH-P0-003`, `SEARCH-P1-003` | Extends `DISC-P3-006` |
| `SEARCH-P3-002` | Feed review outcomes into casting/content backlog | `planned` | `SEARCH-P3-001` | [casting-discoverability.md](../casting-discoverability.md) Tier 2–3 |
| `SEARCH-P3-003` | Re-check CWV / Experience in GSC after major visual changes | `planned` | `SEARCH-P0-002` | Hero/reel pages especially |

Content that moves rankings (Person facts, `/for/*` landers, materials downloads, news cadence) remains owned by **`DISC-*`**. This phase is the **measurement feedback loop** into that backlog.

---

## Dependency graph

```text
SEARCH-P0-001 (apex / DISC-P0-001)
    ├── SEARCH-P0-002 (GSC sitemap / DISC-P0-002)
    │       ├── SEARCH-P0-004 (request indexing)
    │       └── SEARCH-P3-001 (monthly review) ─┬─ needs SEARCH-P0-003
    │                                            └─ needs SEARCH-P1-003 (events)
    ├── SEARCH-P0-005 (preferred host)
    └── SEARCH-P0-003 (GA4 link)
            └── SEARCH-P1-005 (measurement-only admin)

SEARCH-P1-001 (Measurement ID IaC) ── done
    └── SEARCH-P1-002 (gtag) ── done
            ├── SEARCH-P1-003 (events)
            ├── SEARCH-P1-004 (privacy) ── done
            └── SEARCH-P1-006 (consent, optional)

SEARCH-P2-* (SEO polish) — parallel after/with Phase 1; not blocked on apex
SEARCH-P3-002 — consumes SEARCH-P3-001 → DISC content items
```

---

## Monthly operating loop (`SEARCH-OPS`)

Run after Phase 0 is green (roughly aligns with `DISC-P3-006`):

| Source | Look at | Action |
|--------|---------|--------|
| GSC Performance | Queries, CTR, impressions on `/for/*`, `/lessons`, brand vs non-brand | Refine titles/descriptions or new/refined casting landers (`DISC-P3-002`) |
| GSC Pages | Coverage errors, unexpected URLs (`/studio`, old WP paths) | 301s / `noIndex` / sitemap filter |
| GA4 Acquisition → Organic Search | Landing pages, engagement | Fix weak landers; promote strong ones in nav/home |
| GA4 Events | Inquiry / download conversion by landing page | Prioritize content refresh |
| GA4 ↔ GSC (linked) | Query → page → conversion | Decide content vs technical fix |
| GSC Experience / CWV | LCP on hero/reel-heavy pages, mobile | Perf follow-ups (`SEARCH-P3-003`) |
| GSC Enhancements | Person, VideoObject, EducationalOrganization, Offer | Fix schema; Rich Results Test before/after |

**Rule of thumb:** App Insights answers “is Studio/prod healthy?”; GA4 + GSC answer “who finds us in search, where do they land, and do they inquire or download materials?”

---

## Out of scope

- Replacing App Insights with GA for Studio/ops telemetry
- Keyword-stuffed titles/descriptions “for GSC”
- Advertising / remarketing configuration (unless a future decision flips `SEARCH-P1-005`)
- Full casting content strategy — see [casting-discoverability.md](../casting-discoverability.md)
- Assuming sitemap submission alone ranks `/for/*` landers — index pipeline ≠ ranking lever

---

## Suggested implementation order

1. **Phase 0** — Apex + GSC verify/sitemap + GA4 link + indexing requests (`SEARCH-P0-*`, overlapping `DISC-P0-001`/`002`)
2. **Phase 1a** — Measurement ID + loader + privacy — **done** (`SEARCH-P1-001`, `002`, `004`)
3. **Phase 1b** — Conversion events + GA Admin measurement-only (`SEARCH-P1-003`, `005`)
4. **Phase 2** — SEO polish PRs (`SEARCH-P2-*`), can parallelize with 1b / post-cutover
5. **Phase 3** — Monthly loop → feed `DISC-*` content backlog

---

## Related documents

| Doc | Relationship |
|-----|----------------|
| [casting-discoverability.md](../casting-discoverability.md) | Casting SEO backlog (`DISC-*`); shares P0 cutover/console items |
| [wordpress-to-azure-cutover.md](../runbooks/wordpress-to-azure-cutover.md) §6 | Operator checklist for search consoles |
| [dns-and-domain.md](../runbooks/dns-and-domain.md) | Apex / www |
| [observability.md](../runbooks/observability.md) | App Insights vs GA4 |
| [rotate-secrets.md](../runbooks/rotate-secrets.md) | GA Measurement ID rotation (public env, not KV) |
| [add-casting-page.md](../runbooks/add-casting-page.md) | New `/for/*` landers (sitemap inclusion) |
| [ux-release-testing-strategy.md](ux-release-testing-strategy.md) | Planned `J-SEO-01` |
