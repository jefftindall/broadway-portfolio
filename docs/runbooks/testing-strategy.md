# Runbook: Testing strategy (staging → production)

**Status:** Phase 1 implemented (smoke + journey E2E). Phases 2–4 are planned backlog.

This document defines how we validate user experience before production deploys. Automated **authenticated Studio flows are intentionally out of scope** (Gemini cost, Entra test users, publish side effects). Studio is covered by manual checklists and App Insights — see [refine-studio-gemini.md](refine-studio-gemini.md) and [observability.md](observability.md).

---

## Goals

1. **Journey tests over page pings** — casting directors, students, and visitors complete real flows; we do not only assert that routes return HTTP 200.
2. **Staging is the hard gate** — production never deploys unless staging deploy **and** automated verification both succeed.
3. **Content-driven assertions** — tests read `src/content/` at runtime so new credits or news posts do not break CI with hard-coded titles.
4. **Fast vs deep** — smoke stays under ~5 minutes; journeys add ~8–12 minutes on desktop plus a mobile subset.

---

## What runs today

| Layer | When | Command / job | What it validates |
|-------|------|---------------|-------------------|
| Static analysis | Every PR + `main` | `npm run lint` | Terraform, Astro check, API syntax |
| Terraform plan | PRs touching `infra/` | CI **Plan staging/prod** | Infra diff review |
| **Smoke** | After staging deploy | `npm run test:smoke` — job **Smoke Staging** | Route availability, SEO shell, downloads, anonymous `/studio` redirect (desktop + mobile) |
| **Journeys** | After smoke in same job | `npm run test:journey` | Persona flows: casting, lessons, news, gallery, navigation (desktop full + mobile subset) |
| Prod availability | Continuous | App Insights synthetic (prod) | Homepage ping every 10 minutes |

Production deploy (`deploy_prod`) requires **Smoke Staging** success (smoke + journeys).

---

## Test layout

```
tests/
  helpers/
    content.ts       # Read slugs/titles from src/content (no hard-coded credits)
    propagation.ts   # waitForOk — SWA CDN propagation polling
  smoke/
    staging.spec.ts  # Tier A — fast availability
  journeys/
    casting.spec.ts  # CAST-01 … CAST-04
    lessons.spec.ts  # LESSON-01 … LESSON-02
    visitor.spec.ts  # VISIT-01 … VISIT-04

playwright.smoke.config.ts
playwright.journey.config.ts
```

### Tier A — Smoke (`npm run test:smoke`)

- Public routes: home, shows, gallery, lessons, materials, about, contact
- Extended routes: `/news`, `/lessons/book`, sample `/for/{slug}`
- Assets: resume PDF, theatrical headshot JPG
- SEO: `robots.txt`, `sitemap-index.xml`
- Auth boundary: anonymous `GET /studio` returns redirect on SWA hosts (skipped locally — `astro preview` has no Easy Auth)
- Shows list: at least one credit title from content (not fixed show names)
- Viewports: desktop + mobile (parallel)

### Tier B — Journeys (`npm run test:journey`)

| ID | Journey | Viewports |
|----|---------|-----------|
| `CAST-01` | Home → Materials → reel + downloads + casting mailto | Desktop |
| `CAST-02` | Shows → filter “Musical” → credits update | Desktop |
| `CAST-03` | `/for/{slug}` → CTA + contact link | Desktop |
| `CAST-04` | Mobile: materials in ≤2 taps from home | Mobile (`@mobile`) |
| `LESSON-01` | Lessons → Book → rates → lesson inquiry mailto; no acting-lesson copy | Desktop + mobile |
| `LESSON-02` | Contact → Book a lesson | Desktop |
| `VISIT-01` | News list → article | Desktop |
| `VISIT-02` | Gallery images load | Desktop |
| `VISIT-03` | Primary nav from home (all items) | Desktop |
| `VISIT-04` | Mobile hamburger → Shows | Mobile (`@mobile`) |

Journey config runs **all tests on desktop**; the **mobile** project runs only tests tagged `@mobile`.

---

## Personas (reference)

| Persona | Primary journeys | Business risk |
|---------|------------------|---------------|
| Casting director / agent | `CAST-*`, materials smoke | High — broken downloads or mailto blocks inquiries |
| Voice student / parent | `LESSON-*` | Medium — wrong copy or broken book flow |
| Press / visitor | `VISIT-*` | Medium — broken news/nav erodes trust |

Brand rule enforced in `LESSON-01`: copy must not advertise acting lessons, monologue coaching, or scene study (aligned with [style-guide.md](../style-guide.md) and Studio Gemini prompts).

---

## Explicitly out of scope (automated)

| Item | Reason | Alternative |
|------|--------|-------------|
| Entra sign-in for Studio | Test user + session maintenance | Manual checklist on Studio changes |
| Gemini draft / publish in CI | API cost + GitHub commits | [refine-studio-gemini.md](refine-studio-gemini.md) staging smoke |
| Weekly Studio cron | Same | Manual + App Insights `StudioPublishFailed` |

**Anonymous API auth gates** (no Gemini) are planned for **Phase 2**: `GET /studio` redirect, `GET /api/publisherStatus` → 401/302.

---

## Local commands

Against a running site (staging hostname or `npm run preview` after build):

```bash
export BASE_URL=https://<staging-hostname>.azurestaticapps.net
npm ci
npx playwright install chromium
npm run test:smoke
npm run test:journey
```

`BASE_URL` is required; both configs throw if it is missing.

For local preview, propagation polling is usually instant; `waitForOk` still works.

---

## CI integration

**Azure Static Web Apps CI/CD** and **Staging branch** workflows (when a release runs):

1. Deploy staging
2. Resolve staging hostname via Azure CLI
3. `npm run test:smoke`
4. `npm run test:journey`
5. Prod deploy only if both pass

Docs-only merges to `main` skip deploy and smoke. Manual **Azure Static Web Apps CI/CD** dispatch always runs the full path. On failure: Playwright retains **trace on first retry** (`trace: 'on-first-retry'`). Re-run via workflow dispatch or download artifacts from the Actions run.

---

## Implementation phases (backlog)

### Phase 1 — Done

- Journey specs + extended smoke
- `playwright.journey.config.ts` + npm scripts
- CI: journeys in **Smoke Staging** job; prod gated on success
- This runbook

### Phase 2 — API + post-prod safety net

- Anonymous API contract tests (`/api/publisherStatus`, etc.)
- Post-deploy prod subset (home, materials, lessons/book, one `/for/` page) with retries
- Expand Terraform availability tests beyond homepage

### Phase 3 — Shift left on PRs

- `npm run build` in static analysis (or dedicated job)
- Link checker on `dist/`
- Unit tests for `api/src/lib/contentValidate.js` and resume PDF generator

### Phase 4 — Weekly quality (optional)

- `@axe-core/playwright` on key pages
- Lighthouse CI budgets (mobile home + materials)

---

## Flakiness and operations

| Risk | Mitigation |
|------|------------|
| SWA CDN propagation | `waitForOk` polls up to 4 minutes |
| Brittle copy assertions | Prefer roles, `href`, and content fixtures |
| Suite duration | Smoke parallel; journeys ~15 min cap; no Studio in CI |
| Failed run | Check trace; re-run **Staging branch** workflow on the same branch |

---

## Related docs

- [deploy-and-rollback.md](deploy-and-rollback.md) — promotion path and manual staging workflow
- [setup.md](../setup.md) — CI workflow table
- [casting-discoverability.md](../casting-discoverability.md) — mobile materials UX (`DISC-RUB-06`)
- [observability.md](observability.md) — prod synthetics and Studio events
