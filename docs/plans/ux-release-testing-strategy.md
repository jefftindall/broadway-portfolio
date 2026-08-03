# Plan: UX release testing strategy

## Problem

Staging → production is gated by Playwright smoke ([`tests/smoke/staging.spec.ts`](../../tests/smoke/staging.spec.ts)), but that suite only asserts that selected routes load and show an `h1` (plus a resume PDF byte check). It does **not** exercise complete visitor journeys: navigation, filters, booking/casting funnels, news loops, downloadable assets, or Studio publish.

Today’s release stack:

| Layer | What runs | Gap |
|-------|-----------|-----|
| PR | Terraform lint, `astro check`, API `node --check` | No journey or UX assertions |
| Post-staging CD | Desktop + mobile Chromium “page loads” smoke | Blocks prod, but shallow |
| Prod | App Insights homepage ping every 10 min | Availability only |
| Studio / casting / booking | Manual (setup cutover, runbooks) | Easy to skip under time pressure |

A green smoke run can still ship a broken filter, dead CTA, wrong mailto subject, 404 news card, missing headshot, or Studio stuck on “Checking access…”.

**Goal:** Keep promotion fast and stable, while ensuring the journeys that matter for casting directors, students, and the publisher cannot regress unnoticed before production.

---

## Principles

1. **Journeys over pages** — Prefer “home → materials → resume + casting mailto” over “`/materials` has an H1”.
2. **Tier by risk and speed** — Cheap checks on every PR; full journey suite against live staging as the prod gate; authenticated Studio and rare SEO surfaces as scheduled/manual until fixtures exist.
3. **Assert contracts, not copy poetry** — Roles, `href`s, filter visibility, HTTP status, and brand invariants (voice lessons only). Avoid brittle marketing prose.
4. **Reuse what works** — Keep `BASE_URL`, `waitForOk` CDN polling, desktop + mobile Chromium projects, CI retries.
5. **No false confidence** — A shallow smoke that always passes is worse than a smaller suite of real journeys. Prefer fewer, deeper tests.
6. **Static site reality** — Almost all public UX is static HTML + two client filter scripts. Most journeys need no mocks. Studio needs auth/API strategy before it can gate prod.

---

## Target architecture (test layers)

```text
┌─────────────────────────────────────────────────────────────┐
│ L0  Static analysis (existing)                              │
│     terraform · astro check · API syntax                    │
├─────────────────────────────────────────────────────────────┤
│ L1  Content & contract checks (new, PR / local)             │
│     Zod/content fixtures · brand copy guards · mailto helpers│
├─────────────────────────────────────────────────────────────┤
│ L2  Local / preview journey suite (new, PR-optional → CI)   │
│     Playwright vs astro preview or built dist               │
├─────────────────────────────────────────────────────────────┤
│ L3  Staging release gate (expand existing smoke)            │
│     Critical public journeys · desktop + mobile · blocks prod│
├─────────────────────────────────────────────────────────────┤
│ L4  Studio & ops checks (staged rollout)                    │
│     Unauth redirect · publisher deny · publish happy path    │
├─────────────────────────────────────────────────────────────┤
│ L5  Prod signals (existing + light add-ons)                 │
│     Availability · optional synthetic journeys / alerts      │
└─────────────────────────────────────────────────────────────┘
```

L3 remains the hard gate for production. L1/L2 catch regressions earlier and cheaper. L4 must not flake the main CD path until auth is deterministic.

---

## Critical user journeys (catalog)

Prioritized by business impact and current automation gap.

### P0 — Must block production (expand L3)

| ID | Journey | Why it matters | Key assertions |
|----|---------|----------------|----------------|
| **J-NAV-01** | Mobile: open Menu → Lessons (and one other nav item) | Primary discovery on phones | `<details>` Menu opens; destination `h1` |
| **J-CAST-01** | Home → Request materials → Resume PDF + casting mailto | Casting funnel | `/materials` (or `/materials/`); PDF 200 + PDF content-type; mailto subject includes `Casting Inquiry`; headshot download 200 |
| **J-SHOW-01** | Shows → filter by category → restore All | Only non-trivial public client JS | Click `Film`/`Cabaret` tab; non-matching `.credit-item` `hidden`; All restores |
| **J-GAL-01** | Gallery → filter by tag → restore all | Same class of JS risk | e.g. `headshot`; non-matching `.gallery-item` hidden |
| **J-LESS-01** | Lessons → Book a lesson → Email to inquire | Student funnel | `/lessons/book`; mailto subject `Lesson Inquiry`; brand: voice/vocal/CCM, not acting lessons |
| **J-NEWS-01** | Home news teaser → post → All news → second post | Content loop currently untested | Detail `h1`; back link; second slug 200 |
| **J-FOR-01** | One casting landing `/for/{slug}` → View all shows / Contact CTA | SEO landings omitted from smoke today | `h1`; mailto subject includes keyword/CTA; `/shows` or `/contact` |
| **J-ASSET-01** | Materials assets | Casting packet | Resume + theatrical headshot GET 200, non-trivial size |

Keep a thin **route health** check (current H1 smokes) only as a fast canary for About/Contact/Home brand — fold into journey files rather than a separate shallow suite.

### P1 — Should automate soon (L2 and/or L3)

| ID | Journey | Notes |
|----|---------|-------|
| **J-REEL-01** | Home Watch reel → `#reel` iframe present; Shows reel present | Assert iframe `title` / visibility, not YouTube playback |
| **J-CONTACT-01** | Contact lanes: casting mailto + Book a lesson + Instagram `_blank` | `href` contracts |
| **J-FOOT-01** | Footer CTAs on a page that shows the band (e.g. `/shows`) | Materials / Contact / Lessons + mailto |
| **J-ABOUT-01** | About → Lessons / Book CTAs | Teaching cross-links |
| **J-A11Y-01** | Skip link focuses `#main`; primary `nav` landmark; filter tablists | Smoke-level a11y, not full axe suite initially |
| **J-SEO-01** | Sample pages have title/canonical/OG; sitemap excludes `/studio` | Lightweight `request` + DOM checks |

### P2 — Studio / authenticated (L4)

| ID | Journey | Gate recommendation |
|----|---------|---------------------|
| **J-STU-01** | Anonymous `/studio` → AAD login redirect | Safe on staging without secrets; add to L3 once stable |
| **J-STU-02** | Signed-in non-publisher → deny + `Reference:` correlation id | Needs test account outside allowlist |
| **J-STU-03** | Publisher compose → Preview → Publish → pipeline → View page | Needs allowlisted identity + Gemini/GitHub; prefer staging-only scheduled workflow or manual checklist until service principal / storageState exists |
| **J-API-01** | Unauthenticated `POST /api/updateContent` → 401/302 | No Gemini call; good L3 candidate |
| **J-API-02** | Unit/integration: `contentValidate`, Gemini tool schema, httpErrors shape | Node test runner in `api/` — PR layer, not live staging |

### Out of scope for release gates

- YouTube actual playback, Instagram network, real email send
- Style guide page
- Full axe/WCAG audit on every deploy (run periodically or on PR sample)
- Visual pixel diffs (optional later if design regressions dominate)

---

## Proposed suite layout

```text
tests/
  helpers/
    waitForOk.ts          # extract from staging.spec.ts
    mailto.ts             # parse/assert mailto href + subject
    brand.ts              # voice-lessons-only negative checks
  smoke/                  # L3 — keep name; rewrite contents as journeys
    casting-funnel.spec.ts
    shows-gallery-filters.spec.ts
    lessons-funnel.spec.ts
    news-loop.spec.ts
    casting-landing.spec.ts
    nav-mobile.spec.ts
    studio-unauth.spec.ts   # when ready
  journeys/               # optional L2 — same specs, local preview config
playwright.smoke.config.ts          # live BASE_URL (staging gate)
playwright.preview.config.ts        # NEW — webServer: npm run preview / build
```

**Config strategy**

- Keep one journey authoring surface; point at staging via `BASE_URL` for CD.
- Add a preview config that builds (or uses existing `dist/`) and serves locally so journeys can run on PRs without Azure.
- Desktop + mobile projects stay for L3. L2 can run desktop-only on PRs for speed, with mobile reserved for staging gate.

**Stability rules for L3**

- Reuse `waitForOk` (4 min CDN poll) before first assertion per journey start.
- Prefer `getByRole` / `getByRole('link', { name })` over CSS classes except filter internals (`[data-filter]`, `.credit-item[hidden]`).
- Pin one known casting slug and one known news slug from content, or discover dynamically from the index (prefer dynamic discovery to survive content edits).
- Cap suite runtime: target **≤ 8 minutes** wall clock on CI with 2 workers (current smoke budget).
- Retries stay at 2 on CI; do not raise to hide flaky selectors.

---

## CI/CD integration

### Keep

- PR: static analysis required for merge.
- `main`: Deploy Staging → **Smoke Staging** → Deploy Production.
- Manual **Staging branch** workflow runs the same L3 suite.

### Change (phased)

| Phase | CD / CI change |
|-------|----------------|
| **A** | Replace shallow smoke body with P0 journeys; same job name/script (`test:smoke`) so workflows stay green with richer coverage |
| **B** | Add `test:journeys` (preview config) on PRs as non-blocking `continue-on-error` or a separate optional job; promote to required once stable |
| **C** | Add `J-STU-01` + `J-API-01` to L3; document Studio happy-path as scheduled `workflow_dispatch` or nightly against staging with secrets |
| **D** | Optional: post-prod canary (subset of P0 against prod hostname) — alert only, do not auto-rollback |

### Docs to update when implementing

- [`docs/runbooks/deploy-and-rollback.md`](../runbooks/deploy-and-rollback.md) — replace “page list” with journey list
- [`docs/setup.md`](../setup.md) — cutover checklist aligns with automated P0
- [`AGENTS.md`](../../AGENTS.md) — mention journey suite + when to run locally

---

## L1 content & contract checks (PR)

Small Node tests (or scripts invoked from `npm run lint` / a new `npm test`) that do not need a browser:

1. **Brand guard** — Lessons/about/casting markdown + Gemini system instruction still forbid advertising acting lessons / monologue coaching (mirror Studio rules in [`api/src/lib/gemini.js`](../../api/src/lib/gemini.js)).
2. **Featured home invariant** — `getFeaturedShowsForHome` returns ≤ 3; at least one featured show exists.
3. **Resume inputs** — Every show referenced by resume generation parses; PDF script dry-run or size floor after `resume:pdf` in CI (optional; build already regenerates).
4. **Casting slugs** — Every `src/content/casting/*.md` has required frontmatter; sample `/for/...` paths are unique.
5. **API error contract** — `httpErrors` responses include friendly message + `correlationId`, never raw `err.message` (unit test).

These catch content/schema footguns before Playwright.

---

## Studio testing strategy (detail)

Studio is the highest-value and highest-flake surface.

| Approach | Use when |
|----------|----------|
| **Unauth redirect + API 401** | Always — no secrets; L3 |
| **UI with mocked `fetch`** | Local/component-level later if Studio is extracted; not required first |
| **Staging storageState** | Committed-encrypted or Actions secret Playwright auth for allowlisted test user; enables J-STU-02/03 |
| **Publish to a throwaway draft path** | Prefer news draft or a dedicated test slug cleaned up after; never mutate prod-only content from CI |
| **Manual checklist** | Keep in [`refine-studio-gemini.md`](../runbooks/refine-studio-gemini.md) until J-STU-03 is green ≥ 2 weeks |

Do **not** call live Gemini on every `main` deploy until cost, rate limits, and cleanup are solved. Preview/draft against staging on a schedule is enough.

---

## Manual / exploratory QA (kept, shrunk)

Automating P0 should shrink the cutover checklist to:

- [ ] Spot-check hero imagery and reel on staging after large design PRs
- [ ] Authenticated Studio publish (until L4 exists)
- [ ] One real device pass after nav/CSS overhauls (in addition to Pixel 5 emulation)

Everything else in today’s setup cutover smoke becomes redundant once P0 is automated.

---

## Implementation phases

### Phase A — Staging gate with real journeys (highest ROI)

**Action IDs**

| ID | Work |
|----|------|
| **TEST-A-001** | Extract `waitForOk` (+ mailto helper) under `tests/helpers/` |
| **TEST-A-002** | Implement P0 journey specs; delete redundant H1-only cases |
| **TEST-A-003** | Dynamically pick news/casting targets from live index where possible |
| **TEST-A-004** | Run against staging via existing `smoke_staging` job; confirm ≤ ~8 min |
| **TEST-A-005** | Update deploy/setup docs to describe journeys |

**Exit criteria:** Production blocked unless casting funnel, filters, lessons booking CTA, news loop, one `/for/*`, mobile nav, and assets pass on desktop + mobile.

### Phase B — Shift left on PRs

| ID | Work |
|----|------|
| **TEST-B-001** | `playwright.preview.config.ts` + `npm run test:journeys` using `astro build && astro preview` (or `preview` after CI build artifact) |
| **TEST-B-002** | Wire optional PR job; fix flakes; then mark required |
| **TEST-B-003** | Add L1 brand/content/API contract tests to `npm test` / lint pipeline |

**Exit criteria:** Most journey failures fail the PR before merge; staging gate remains the live CDN truth.

### Phase C — Studio & API safety net

| ID | Work |
|----|------|
| **TEST-C-001** | L3: unauth `/studio` redirect + unauth API status |
| **TEST-C-002** | API unit tests for validation + httpErrors |
| **TEST-C-003** | Staging auth fixture + scheduled publisher smoke (draft/publish/cleanup) |
| **TEST-C-004** | Align runbooks; remove duplicate manual steps |

### Phase D — Observability loop

| ID | Work |
|----|------|
| **TEST-D-001** | On smoke failure: upload Playwright trace/video artifacts (ensure workflow `actions/upload-artifact`) |
| **TEST-D-002** | Map failures to App Insights / correlation IDs in [`observability.md`](../runbooks/observability.md) |
| **TEST-D-003** | Optional prod synthetic subset + alert (no auto-promote interaction) |

---

## Example: journey assertion style (Phase A)

Illustrative — not committed as code in this plan:

```ts
test('casting materials funnel', async ({ page, request }) => {
  await waitForOk(page, '/');
  await page.getByRole('link', { name: /Request materials/i }).click();
  await expect(page).toHaveURL(/\/materials\/?$/);
  await expect(page.getByRole('heading', { name: 'Materials', level: 1 })).toBeVisible();

  const pdf = await request.get('/downloads/elyse-tindall-resume.pdf');
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type'] ?? '').toMatch(/pdf|octet-stream/i);

  const headshot = await request.get('/downloads/elyse-tindall-headshot-theatrical.jpg');
  expect(headshot.status()).toBe(200);

  await expect(page.getByRole('link', { name: /Email casting inquiry|Casting Inquiry/i }).first())
    .toHaveAttribute('href', /subject=.*Casting%20Inquiry/i);
});
```

Filters should assert behavior, not screenshots:

```ts
await page.getByRole('tab', { name: /^Film$/i }).click();
await expect(page.getByRole('tab', { name: /^Film$/i })).toHaveAttribute('aria-selected', 'true');
for (const item of await page.locator('.credit-item:not([data-category="film"])').all()) {
  await expect(item).toBeHidden();
}
```

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Content edits break hard-coded titles/slugs | Discover from index; soft-assert “at least one credit visible” |
| CDN propagation flakes | Keep `waitForOk`; journey starts only after 2xx |
| Suite too slow / blocks CD | Cap P0; run P1 on PR preview; parallel workers |
| Mailto/tel cannot be “clicked” in CI | Assert `href` only |
| Studio auth secrets in CI | Separate workflow; never block prod on Gemini until stable |
| Over-testing copy | Brand invariants + roles; not full prose snapshots |

---

## Success metrics

- Staging smoke failures correlate with real UX bugs (not selector churn).
- Zero production incidents of “page loads but funnel broken” for P0 journeys after Phase A.
- Manual cutover checklist shrinks to Studio + visual spot-check.
- PR journey job (Phase B) catches ≥ half of journey failures before merge within a month of enabling it.

---

## Recommendation

Start with **Phase A only**: rewrite the existing staging Playwright gate into the P0 journeys above without adding new CI jobs or Studio auth. That closes the largest gap (shallow page checks vs real funnels) with the least operational risk. Phases B–D follow once A is green on `main` for several deploys.
