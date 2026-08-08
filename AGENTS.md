See README.md and docs/ for project guidance.

## Cursor Cloud specific instructions

Single-product Astro portfolio + optional Gemini-powered "Studio" Azure Functions API. Node >= 22.12 is required (see root `package.json` engines). Cloud agent runtime is defined in [`.cursor/environment.json`](.cursor/environment.json): the `install` script runs `npm ci` for the root site and `api/`. Bake Node, Terraform (>= 1.5), TFLint (`tflint --init` in `infra/`), and Azure CLI (`az`) into the Cursor Cloud environment **snapshot** (then set `"snapshot"` in `environment.json`). Azure Functions Core Tools (`func`) may be present on the base/snapshot image but is **not** part of `install`. The `site` terminal starts Astro on port 4321 for browser / computer-use checks.

### Lint and static analysis (required before commit)

**Agents must run local static analysis before committing or pushing code:**

```bash
npm run lint
```

This mirrors the PR gate workflow [`.github/workflows/static-analysis.yml`](.github/workflows/static-analysis.yml):

| Check | Local command | CI job |
|-------|---------------|--------|
| Terraform fmt + TFLint + validate | `npm run lint:terraform` | Terraform lint |
| Astro / TypeScript | `npm run check` | Site check |
| API JS syntax | `npm run lint:api` | API syntax |
| Terraform plan (CI only, after the checks above) | — | Plan staging / Plan prod (PRs touching `infra/`) |

Requirements for Terraform lint: Terraform >= 1.5 and [TFLint](https://github.com/terraform-linters/tflint) on `PATH` (`tflint --init` uses [`infra/.tflint.hcl`](infra/.tflint.hcl)). On Cursor Cloud these come from the environment snapshot; if they are missing, install them before committing rather than skipping the gate. Do not commit if lint fails; do not skip these checks.

### Brand (teaching)
- Elyse is a musical theatre **actress** and **vocal coach**. Private lessons are **voice lessons only** (vocal pedagogy, vocal health, CCM).
- Do **not** advertise acting lessons, monologue coaching, or scene study. Studio Gemini prompts in [`api/src/lib/gemini.js`](api/src/lib/gemini.js) encode the same rules — keep them aligned when editing copy or prompts.
- See [`docs/style-guide.md`](docs/style-guide.md) and [`docs/runbooks/refine-studio-gemini.md`](docs/runbooks/refine-studio-gemini.md).

### Studio help (authenticated)
- User guide: [`/studio/help`](src/pages/studio/help.astro) — linked only from `/studio`, SWA `authenticated` on `/studio` and `/studio/*`, `noIndex`, excluded from sitemap via the existing `/studio` filter.
- Capability catalog + example prompts: [`src/lib/studioHelp.ts`](src/lib/studioHelp.ts). **When changing Gemini tools or Studio voice UX, update this catalog and the help page in the same PR** (see [`.cursor/rules/studio-help.mdc`](.cursor/rules/studio-help.mdc) and the refine-studio-gemini checklist).
- Signed-in users may open help even if they are not on `ALLOWED_USER_IDS` yet.
- Device reference for mic/screenshots: **iPhone 17 · Safari**.

### Public site (primary service)
- Dev server: `npm run dev` (Astro, serves on port 4321). Build: `npm run build` (runs `resume:pdf` then Astro → `dist/`).
- Verification: `npm run lint` plus `npm run build` and manual checks. Post-staging CD runs `npm run test:smoke` and profile-based journeys (`test:journey` or `test:journey:content`); prod reuses the same build artifact — see [`docs/runbooks/testing-strategy.md`](docs/runbooks/testing-strategy.md).
- Content is markdown under `src/content/` (`shows`, `news`, `gallery`, `pages`, `casting`) with Zod schemas in `src/content.config.ts`. Adding a markdown file adds a live route (e.g. a new `src/content/news/*.md` appears on `/news` and `/news/<id>`).
- **Removed pages / URLs:** Whenever a public page or content route is removed, renamed, or otherwise stops serving at its old path, add a **301 redirect** in [`public/staticwebapp.config.json`](public/staticwebapp.config.json) (and mirror in root [`staticwebapp.config.json`](staticwebapp.config.json)) from the old URL to the best remaining equivalent. One hop only; list each path once (SWA treats `/path` and `/path/` as duplicates — prefer slashless). Do not leave public 404s for known old links — see [`docs/runbooks/wordpress-to-azure-cutover.md`](docs/runbooks/wordpress-to-azure-cutover.md).
- **Featured shows:** Set `featured: true` only on headline credits. The homepage always shows the **three most recent** featured shows by `year`, then `order` (lower = newer within a year) via [`src/lib/shows.ts`](src/lib/shows.ts) (`getFeaturedShowsForHome`). When adding a new featured credit, mark it featured and set `order` so newer months sort first — it will surface on home automatically if it is among the three newest.
- **Resume PDF:** Generated from `src/content/shows/*.md` + [`src/content/resume-meta.json`](src/content/resume-meta.json) by [`scripts/generate-resume-pdf.mjs`](scripts/generate-resume-pdf.mjs). Theater = musical/play/cabaret; film = `category: film`. Featured first within each section, then year/order. Show `venue` should be `[Theater Name] - [City], [ST]` (room/program context goes in the show body). Run `npm run resume:pdf` after show edits (or rely on `npm run build`, which always regenerates before shipping). Commit the updated `public/downloads/elyse-tindall-resume.pdf` when shows change so the repo artifact stays reviewable.

### Public SEO & analytics
Phased GSC + GA4 work: [`docs/plans/search-and-analytics.md`](docs/plans/search-and-analytics.md) (`SEARCH-*`). Keep that plan and this section current when changing the contracts below (see [`.cursor/rules/search-seo.mdc`](.cursor/rules/search-seo.mdc)).

- **GA4 (Phase 1):** Load only on public pages via `src/scripts/ga.ts` / `src/lib/analytics.ts`. Skip `/studio` and `noIndex` pages. Events: `generate_lead`, `file_download`, `select_content` (`trackGaEvent` / `data-ga-*`). App Insights stays Studio/ops — do not send Studio diagnostics to GA. Consent Mode banner is `wont_fix` unless reopened deliberately.
- **Titles (Phase 2):** Pages pass bare titles; [`BaseLayout`](src/layouts/BaseLayout.astro) appends ` · Elyse Tindall` (strips legacy `| Elyse Tindall`). Casting frontmatter must not embed the brand — [`add-casting-page.md`](docs/runbooks/add-casting-page.md).
- **JSON-LD:** [`Seo.astro`](src/components/Seo.astro) prepends default `Person` when custom `jsonLd` lacks a top-level / `@graph` Person (nested `about`/`founder` do not count). Prefer slashless URLs in JSON-LD and canonicals.
- **Crawlers:** Sitemap filters `/studio`; `noIndex` on Studio; `Disallow: /studio` in [`public/robots.txt`](public/robots.txt). Default OG: [`public/images/og-default.jpg`](public/images/og-default.jpg) (1200×630) with width/height/alt when used. Journey coverage: `tests/journeys/seo.spec.ts` (`J-SEO-01`).

### Studio API (`api/`, optional local)
- Requires **Azure Functions Core Tools** (`func`), which is present in the Cursor Cloud base image (v4) but is NOT part of `npm` deps and NOT installed by the update script. If it is ever missing, install it separately (`npm i -g azure-functions-core-tools@4`).
- Copy `api/local.settings.json.example` → `api/local.settings.json` (gitignored), then run `func start` (port 7071). Endpoints: `POST /api/updateContent`, `POST /api/uploadMedia`.
- With `AZURE_FUNCTIONS_ENVIRONMENT=Development` (already set in the example settings) the SWA auth allowlist check is skipped, so endpoints are callable locally without SWA auth. However `updateContent` still needs `GEMINI_API_KEY` and GitHub App creds (or `GITHUB_TOKEN`) to actually publish — without them it returns a sanitized 500 plus `correlationId` (not the raw missing-key string).
- Default model is `gemini-3.6-flash` (`GEMINI_MODEL`). Do not reinstate shut-down IDs such as `gemini-2.0-flash`.
- `astro dev` alone does NOT proxy `/api/*` to Functions on :7071. For full local Studio testing, use the Azure SWA CLI or call port 7071 directly.

### Studio errors (user-facing + support)

- **Never** return raw provider/SDK/`err.message` strings to the Studio UI for 500/503 paths. Use [`api/src/lib/httpErrors.js`](api/src/lib/httpErrors.js) so responses are friendly copy + **`correlationId`**.
- Full diagnostics live in Function logs and App Insights (`StudioPublishFailed`, exceptions) keyed by that ID — see [`docs/runbooks/observability.md`](docs/runbooks/observability.md).
- Studio UI should show the friendly message and `Reference: {correlationId}` (same pattern as allowlist denials).
- When changing Studio API error handling, keep this contract; do not put HTTP/correlation rules into the Gemini `systemInstruction`.

### Operational excellence

Phased backlog: [`docs/plans/operational-excellence.md`](docs/plans/operational-excellence.md) (`OPS-*`) — reliability scorecard, SLOs, Sev1 SMS/voice, monthly scorecard refresh. Committed SLO targets include homepage/materials availability **99.8%/7d**, homepage FCP p75 **&lt;1.5s**, Studio publish **95%/28d**, publish→live p95 **≤20m**. Phase 0–1 are done (living scorecard, monthly workflow, KV-backed notify/critical Action Groups). **Do not implement** Phase 2+ (`OPS-P2-*` / `OPS-P3-*`) until an item is explicitly requested.

Living scorecard: [`docs/ops/operational-excellence-scorecard.md`](docs/ops/operational-excellence-scorecard.md). Monthly Actions workflow (`.github/workflows/ops-scorecard-monthly.yml`) re-evaluates and opens a PR (`OPS-P0-003` / `OPS-P0-004`). Refresh locally with `node scripts/ops-scorecard-refresh.mjs`.

**Private ops contacts:** Never commit alert emails, support/SMS/voice numbers, or vendor routing keys. Store them in Key Vault and read at apply/deploy time (same SoT pattern as [`docs/runbooks/rotate-secrets.md`](docs/runbooks/rotate-secrets.md)). Use `ALERT-*` secrets in **`kv-elyse-shared`** (bootstrap); do not reuse `SITE-CONTACT-*` / ACS inquiry SMS for on-call. See [`.cursor/rules/ops-operational-excellence.mdc`](.cursor/rules/ops-operational-excellence.mdc).
