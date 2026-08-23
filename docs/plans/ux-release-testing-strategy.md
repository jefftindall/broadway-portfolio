# Plan: UX release testing strategy

**Artifact ID:** `ELYSE-TEST-001`  
**Version:** 1.3  
**Last updated:** 2026-08-22  
**Audience:** Agents, implementers  
**Scope:** Playwright smoke + journey coverage, PR shift-left, Studio/API safety nets — not ops synthetics (`OPS-*`) or SEO content strategy (`DISC-*` / `SEARCH-*`).

Use the **Action ID** column (`TEST-*`) and journey IDs (`CAST-*`, `LESSON-*`, `VISIT-*`, `J-SEO-01`, …) in PRs and commits.

**Status values:** `planned` · `in_progress` · `blocked` · `done` · `wont_fix`

Living “what runs today” SoT: [testing-strategy.md](../runbooks/testing-strategy.md). This plan is the backlog + journey catalog with statuses.

---

## How to use this document

| Section | Purpose |
|---------|---------|
| [Status at a glance](#status-at-a-glance) | Done vs not done summary |
| [Problem](#problem) | Why journey gates exist |
| [Principles](#principles) | Design rules for the suite |
| [Target architecture](#target-architecture-test-layers) | L0–L5 layers |
| [Journey catalog](#critical-user-journeys-catalog) | IDs + status |
| [Phased backlog](#implementation-phases) | `TEST-*` Action IDs |
| [Studio strategy](#studio-testing-strategy-detail) | Auth / publish constraints |

---

## Status at a glance

| Phase / area | Status | Notes |
|--------------|--------|-------|
| Phase A — Staging gate with real journeys | Mostly `done` | Smoke + journeys on CD; helpers + dynamic content; docs runbook |
| Phase B — Shift left on PRs | `in_progress` | `playwright.journey.config.ts` + `test:journey` exist; **not** wired as a PR-required job yet |
| Phase C — Studio & API safety net | Partial | Unauth `/studio` in smoke (`done`); **signed-in `/studio/health`** (`TEST-C-005` `done` once TOTP is enrolled); API unit tests + publisher auth schedule still `planned` |
| Phase D — Observability loop | Partial | **Smoke Production** + Sev1 on failure (`TEST-D-003` `done`); Playwright **trace/video on failure** still `planned` |

| Journey ID | Status | Where |
|------------|--------|-------|
| `CAST-01` (materials EPK) | `done` | `tests/journeys/casting.spec.ts` |
| `CAST-02` (shows filter) | `done` | Musical filter (not Film/Cabaret-only wording) |
| `CAST-03` (`/for/*` CTA) | `done` | casting.spec.ts |
| `CAST-04` (mobile materials) | `done` | casting.spec.ts |
| `CAST-05` (no inbound `/for` chrome) | `done` | Home/about/shows/materials/contact have no `a[href^="/for"]` |
| `LESSON-01` / `02` | `done` | `tests/journeys/lessons.spec.ts` |
| `LESSON-03` (paid-lesson legal copy) | `done` | Privacy `#payments` + Terms `#paid-lessons`; voice-only phrase uses `.first()` (two matches on `/terms`) |
| `VISIT-01` (news loop) | `done` | `tests/journeys/visitor.spec.ts` |
| `VISIT-02` (gallery images) | `done` | Load/visibility — **not** tag filter |
| `VISIT-03` / `04` (nav / mobile menu) | `done` | visitor.spec.ts |
| `J-SEO-01` | `done` | `tests/journeys/seo.spec.ts` + smoke Disallow |
| `J-GAL-01` (gallery **tag filter**) | `planned` | No filter assertions yet |
| `J-REEL-01` / `J-FOOT-01` / `J-ABOUT-01` / `J-A11Y-01` | `planned` | P1 catalog |
| `J-STU-01` (anon studio) | `done` | Smoke (SWA hosts) |
| `J-STU-05` (anon `/studio/people`) | `done` | Smoke (`STUDIO-P1-003`) |
| `J-STU-04` (signed-in health) | `done` | Smoke `studio-auth.spec.ts` (skips until TOTP seed) |
| `J-STU-02` / `03`, `J-API-01` / `02` | `planned` | Phase C publisher / API |

**Suggested next:** Gallery tag-filter journey (`J-GAL-01`); L1 contract tests (`TEST-B-003`); optional PR journey job (`TEST-B-002`); Studio unauth API status (`TEST-C-001` residual).

---

## Problem

Staging → production is gated by Playwright, but a green run that only checks route H1s can still ship a broken filter, dead CTA, wrong mailto, 404 news card, missing headshot, or Studio stuck on “Checking access…”.

Today’s release stack (see runbook for detail):

| Layer | What runs | Status |
|-------|-----------|--------|
| PR | Terraform lint, `astro check`, API `node --check` | `done` — no journey assertions on PR yet |
| Post-staging CD | Smoke + profile-based journeys (`test:smoke`, `test:journey` / `:content`) | `done` |
| Prod | App Insights homepage + materials synthetics | `done` (`OPS-*`) |
| Studio publish | Manual + App Insights | Intentional until Phase C auth fixtures |

**Goal:** Keep promotion fast and stable, while ensuring casting / student / visitor journeys cannot regress unnoticed before production.

---

## Principles

1. **Journeys over pages** — Prefer “home → materials → resume + casting mailto” over “`/materials` has an H1”.
2. **Tier by risk and speed** — Cheap checks on every PR; full journey suite against live staging as the prod gate; authenticated Studio as scheduled/manual until fixtures exist.
3. **Assert contracts, not copy poetry** — Roles, `href`s, filter visibility, HTTP status, and brand invariants (voice lessons only).
4. **Reuse what works** — `BASE_URL`, CDN `waitForOk`, desktop + mobile Chromium, CI retries.
5. **No false confidence** — Prefer fewer, deeper tests over shallow always-green smokes.
6. **Static site reality** — Most public UX needs no mocks. Studio needs auth/API strategy before it can gate prod on publish.

---

## Target architecture (test layers)

```text
┌─────────────────────────────────────────────────────────────┐
│ L0  Static analysis (existing) — done                       │
│     terraform · astro check · API syntax                    │
├─────────────────────────────────────────────────────────────┤
│ L1  Content & contract checks — planned (TEST-B-003)        │
│     Zod/content fixtures · brand copy guards · mailto helpers│
├─────────────────────────────────────────────────────────────┤
│ L2  Local / preview journey suite — in_progress             │
│     playwright.journey.config.ts exists; PR wiring open     │
├─────────────────────────────────────────────────────────────┤
│ L3  Staging release gate — done                             │
│     smoke + journeys · desktop + mobile · blocks prod       │
├─────────────────────────────────────────────────────────────┤
│ L4  Studio & ops checks — partial                           │
│     Unauth redirect + signed-in /studio/health; publisher planned │
├─────────────────────────────────────────────────────────────┤
│ L5  Prod signals — done                                     │
│     Availability synthetics · Smoke Production + Sev1 alert │
└─────────────────────────────────────────────────────────────┘
```

L3 remains the hard gate for production. L5 smoke is a post-release canary (no auto-rollback). L1/L2 catch regressions earlier. L4 must not flake the main CD path until auth is deterministic.

---

## Critical user journeys (catalog)

Shipped IDs use the names in `tests/journeys/*.spec.ts`. Older plan aliases (`J-CAST-01`, …) map as noted.

### P0 — Must block production (L3)

| ID | Journey | Status | Key assertions |
|----|---------|--------|----------------|
| `VISIT-04` (was `J-NAV-01`) | Mobile menu → destination | `done` | Menu opens; Shows (or nav target) loads |
| `CAST-01` (was `J-CAST-01`) | Home → Materials → resume + headshot + casting path | `done` | `/materials`; PDF/JPG 200; casting CTA |
| `CAST-02` (was `J-SHOW-01`) | Shows → filter by category | `done` | Musical tab; non-matching credits hidden |
| `J-GAL-01` | Gallery → filter by tag → restore | `planned` | Tag filter; non-matching `.gallery-item` hidden |
| `LESSON-01` / `02` (was `J-LESS-01`) | Lessons → book → inquiry | `done` | `/lessons/book`; form; voice-lessons brand |
| `LESSON-03` | Privacy / Terms paid-lesson legal copy | `done` | Stripe; 24h refund; voice-only (`.first()` on `/terms`) |
| `VISIT-01` (was `J-NEWS-01`) | News list → article | `done` | Detail heading; content-driven slug |
| `CAST-03` (was `J-FOR-01`) | `/for/{slug}` → contact CTA | `done` | Dynamic casting slug |
| `CAST-05` | Public chrome does not link to `/for/*` | `done` | Home/about/shows/materials/contact |
| `CAST-01` assets (was `J-ASSET-01`) | Materials downloads | `done` | Resume + theatrical headshot |

Smoke retains thin route canaries (home/about/contact/gallery/news/book) alongside journeys — not fully deleted (`TEST-A-002` residual).

### P1 — Should automate soon

| ID | Journey | Status | Notes |
|----|---------|--------|-------|
| `J-REEL-01` | Home Watch reel → `#reel` iframe | `planned` | Assert presence, not YouTube playback |
| `J-CONTACT-01` | Contact lanes: casting + lesson forms + Instagram `_blank` | `planned` | Partial coverage via LESSON-02 / CAST paths |
| `J-FOOT-01` | Footer CTAs | `planned` | Materials / Contact / Lessons |
| `J-ABOUT-01` | About → Lessons / Book CTAs | `planned` | Teaching cross-links |
| `J-A11Y-01` | Skip link / nav landmark / filter tablists | `planned` | Smoke-level a11y |
| `J-SEO-01` | Title/canonical/OG; sitemap excludes `/studio`; staging noindex when on SWA host | `done` | `tests/journeys/seo.spec.ts` |

### P2 — Studio / authenticated (L4)

| ID | Journey | Status | Gate recommendation |
|----|---------|--------|---------------------|
| `J-STU-01` | Anonymous `/studio` → login redirect (`no-store`) | `done` | Smoke on SWA hosts |
| `J-STU-04` | Signed-in monitor → `/studio/health` marker | `done` | Smoke desktop; skips until `MONITOR-TOTP-SEED` |
| `J-STU-02` | Signed-in non-publisher → deny + `Reference:` | `planned` | Monitor user exists but assertion is health, not compose deny |
| `J-STU-03` | Publisher compose → Preview → Publish | `planned` | Scheduled / manual until storageState |
| `J-API-01` | Unauthenticated `POST /api/updateContent` → 401/302 | `planned` | Good L3 candidate |
| `J-API-02` | Unit: `contentValidate`, schemas, `httpErrors` | `planned` | PR layer in `api/` |

### Out of scope for release gates

- YouTube playback, Instagram network, real email send
- Style guide page
- Full axe/WCAG on every deploy
- Visual pixel diffs (optional later)

---

## Suite layout (current)

```text
tests/
  helpers/
    propagation.ts   # waitForOk CDN polling
    content.ts       # Dynamic casting/news/show discovery
  smoke/
    staging.spec.ts      # L3 canaries + assets + studio unauth
    studio-auth.spec.ts  # J-STU-04 / TEST-C-005
  journeys/
    casting.spec.ts  # CAST-01 … CAST-04
    lessons.spec.ts  # LESSON-01 … LESSON-03
    visitor.spec.ts  # VISIT-01 … VISIT-04
    seo.spec.ts      # J-SEO-01

playwright.smoke.config.ts
playwright.journey.config.ts
```

**Commands:** `npm run test:smoke` · `npm run test:journey` · `npm run test:journey:content`

**Stability rules for L3**

- Reuse `waitForOk` before first assertion per journey start.
- Prefer roles/names over CSS except filter internals.
- Discover casting/news targets from content helpers.
- Cap runtime; retries stay at 2 on CI.

---

## CI/CD integration

### Keep (`done`)

- PR: static analysis required for merge.
- `main`: Deploy Staging → **Smoke Staging** (+ journeys by profile) → Deploy Production.
- Manual **CD: staging** workflow runs the same L3 suite.

### Change (phased)

| Phase | CD / CI change | Status |
|-------|----------------|--------|
| **A** | Real journeys on staging gate | `done` (smoke kept as canary layer + journeys) |
| **B** | Journey/preview on PRs; then required | `in_progress` — config exists; PR job not required |
| **C** | Studio/API deeper checks | `in_progress` (`J-STU-01` + `TEST-C-005`; publisher `TEST-C-003` still planned) |
| **D** | Trace artifacts + optional prod canary | `planned` |

---

## L1 content & contract checks (PR)

Still open (`TEST-B-003`):

1. **Brand guard** — Lessons/about/casting + Gemini instruction forbid acting-lesson marketing.
2. **Featured home invariant** — `getFeaturedShowsForHome` ≤ 3; ≥1 featured show.
3. **Resume inputs** — Show parse / PDF size floor (optional; build already regenerates).
4. **Casting slugs** — Frontmatter required; unique `/for/...` paths.
5. **API error contract** — Friendly message + `correlationId` (unit test).

---

## Studio testing strategy (detail)

| Approach | Status | Use when |
|----------|--------|----------|
| Unauth redirect | `done` | Smoke L3 |
| Signed-in `/studio/health` | `done` | Smoke `TEST-C-005` / `J-STU-04` |
| Unauth API 401 | `planned` | L3 candidate |
| Staging storageState | `planned` | J-STU-02/03 |
| Publish throwaway draft | `planned` | Scheduled only |
| Manual checklist | Keep | [refine-studio-gemini.md](../runbooks/refine-studio-gemini.md) until J-STU-03 stable |

Do **not** call live Gemini on every `main` deploy until cost, rate limits, and cleanup are solved.

---

## Manual / exploratory QA (kept, shrunk)

- [ ] Spot-check hero imagery and reel on staging after large design PRs
- [ ] Authenticated Studio publish (until L4 exists)
- [ ] One real device pass after nav/CSS overhauls

---

## Implementation phases

### Phase A — Staging gate with real journeys

| ID | Work | Status | Primary refs |
|----|------|--------|--------------|
| `TEST-A-001` | Extract helpers (`waitForOk` / content discovery) | `done` | `tests/helpers/propagation.ts`, `content.ts` |
| `TEST-A-002` | Implement P0 journeys; thin smoke canaries remain | `done` | `tests/journeys/*`, `tests/smoke/staging.spec.ts` |
| `TEST-A-003` | Dynamically pick news/casting targets | `done` | `tests/helpers/content.ts` |
| `TEST-A-004` | Staging CD gate (smoke + journeys) | `done` | `.github/workflows/azure-static-web-apps.yml` |
| `TEST-A-005` | Docs describe journeys | `done` | [testing-strategy.md](../runbooks/testing-strategy.md), AGENTS.md |

<details>
<summary><code>TEST-A-*</code> acceptance</summary>

- [x] Casting funnel, shows filter, lessons book, news loop, `/for/*`, mobile nav, assets covered
- [x] Content-driven slugs (no hard-coded credit titles required)
- [x] CD blocks prod when smoke fails; journeys run by change profile
- [ ] Residual: drop redundant H1-only cases where journeys fully supersede (optional cleanup)

</details>

### Phase B — Shift left on PRs

| ID | Work | Status | Primary refs |
|----|------|--------|--------------|
| `TEST-B-001` | Journey config for local/preview runs | `done` | `playwright.journey.config.ts`, `npm run test:journey` |
| `TEST-B-002` | Optional → required PR journey job | `planned` | `.github/workflows/static-analysis.yml` or CD sibling |
| `TEST-B-003` | L1 brand/content/API contract tests | `planned` | `npm test` / lint pipeline |

### Phase C — Studio & API safety net

| ID | Work | Status | Primary refs |
|----|------|--------|--------------|
| `TEST-C-001` | L3: unauth `/studio` + unauth API status | `in_progress` | Studio redirect `done`; API status `planned` |
| `TEST-C-002` | API unit tests for validation + httpErrors | `planned` | `api/` |
| `TEST-C-003` | Staging auth fixture + scheduled publisher smoke | `planned` | Separate workflow; **not** the monitor health check |
| `TEST-C-004` | Align runbooks; shrink manual Studio steps | `planned` | refine-studio-gemini |
| `TEST-C-005` | Post-deploy signed-in `/studio/health` + `client_credentials` | `done` | Bootstrap monitor user; [studio-auth-monitoring.md](../runbooks/studio-auth-monitoring.md) |

<details>
<summary><code>TEST-C-005</code> acceptance</summary>

- [x] Read-only `/studio/health` marker (no compose/Gemini)
- [x] Bootstrap `azuread_user` + `MONITOR-*` in `kv-elyse-shared`; env stacks assign the user to both SWA apps
- [x] Smoke Staging + Smoke Production: `client_credentials` + Playwright login (skip until TOTP seed)
- [x] TOTP capture runbook (software authenticator secret, not push MFA)
- [ ] Residual: operator enrolls TOTP and sets `MONITOR-TOTP-SEED` (out of band)

</details>

### Phase D — Observability loop

| ID | Work | Status | Primary refs |
|----|------|--------|--------------|
| `TEST-D-001` | On Playwright failure: upload trace/video artifacts | `planned` | Workflow `actions/upload-artifact` (release artifact already exists — not test traces) |
| `TEST-D-002` | Map failures to App Insights / correlation IDs | `planned` | [observability.md](../runbooks/observability.md) |
| `TEST-D-003` | Post-release prod smoke + Sev1 alert (SMS+voice) | `done` | **Smoke Production** after deploy; `SmokeFailed` → critical AG; no auto-rollback |

<details>
<summary><code>TEST-D-003</code> acceptance</summary>

- [x] CD runs Playwright smoke against prod hostname after **Deploy Production** succeeds
- [x] Failure emits `SmokeFailed` → `ag-elyse-critical-prod` (email + SMS + voice; same alert rule as `DeployFailed`)
- [x] No automatic rollback on smoke failure
- [x] Runbooks + severity docs cite the path ([testing-strategy.md](../runbooks/testing-strategy.md), [deploy-and-rollback.md](../runbooks/deploy-and-rollback.md))

</details>

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Content edits break hard-coded titles/slugs | Discover from index (`content.ts`) |
| CDN propagation flakes | Keep `waitForOk` |
| Suite too slow / blocks CD | Change-aware journey profiles; cap P0 |
| Mailto/tel cannot be “clicked” in CI | Assert `href` only |
| Studio auth secrets in CI | Shared KV + skip until TOTP; never put monitor on `ALLOWED-USER-IDS` or grant it a profile; publisher E2E still separate (`TEST-C-003`) |
| Over-testing copy | Brand invariants + roles; not full prose snapshots |

---

## Success metrics

- Staging failures correlate with real UX bugs (not selector churn).
- Zero production “page loads but funnel broken” incidents for covered P0 journeys.
- Manual cutover checklist shrinks to Studio + visual spot-check.
- PR journey job (Phase B) catches ≥ half of journey failures before merge within a month of enabling it.

---

## Recommendation

**Phase A is largely shipped.** Do not restart from “rewrite smoke into journeys.” Next highest ROI:

1. `J-GAL-01` gallery tag filter (same JS risk class as shows filter)
2. `TEST-B-003` L1 contract tests on PR
3. `TEST-B-002` optional PR journey job once local `test:journey` is habitually green
4. Phase C API unauth + unit tests before authenticated Studio publish automation
