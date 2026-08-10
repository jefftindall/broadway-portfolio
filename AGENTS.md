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
| Actions secret-safety | `npm run lint:actions-secrets` | Actions secret-safety |
| Terraform plan (CI only, after the checks above) | — | Plan staging / Plan prod (PRs touching `infra/`) |

Requirements for Terraform lint: Terraform >= 1.5 and [TFLint](https://github.com/terraform-linters/tflint) on `PATH` (`tflint --init` uses [`infra/.tflint.hcl`](infra/.tflint.hcl)). On Cursor Cloud these come from the environment snapshot; if they are missing, install them before committing rather than skipping the gate. Do not commit if lint fails; do not skip these checks.

### Plan backlog status (required on phase PRs)

When a PR implements work from [`docs/plans/`](docs/plans/) (`OPS-*`, `SEARCH-*`, `DISC-*`, …), update Action ID statuses and acceptance checklists **in that same PR**. See [`.cursor/rules/plans-status-on-pr.mdc`](.cursor/rules/plans-status-on-pr.mdc).

### Never echo secrets (pipelines + scripts)

**Never** print secret values (`echo` / `printf` / `console.log` / traces / action `with:` dumps) in workflows or scripts. Mask line-by-line; prefer temp files; on errors log names only. Full rules: [`.cursor/rules/never-echo-secrets.mdc`](.cursor/rules/never-echo-secrets.mdc). GitHub App minting: [`scripts/mint-github-app-token.sh`](scripts/mint-github-app-token.sh). If leaked, rotate immediately ([rotate-secrets.md](docs/runbooks/rotate-secrets.md)).

### GitHub Actions (Node runtime + secrets)

When editing `.github/workflows/**` or composite actions: **before commit**, scan `uses:` for actions still on **Node.js 20** and upgrade to a **Node 24+** release (or replace the action) so runners do not warn. Run `npm run lint:actions-secrets` (part of `npm run lint`) — it fails on PEM `with:` inputs, inline `GITHUB-APP-PRIVATE-KEY` fetches, and unsafe multiline `::add-mask::`. See [`.cursor/rules/github-actions-node.mdc`](.cursor/rules/github-actions-node.mdc) and [`.cursor/rules/never-echo-secrets.mdc`](.cursor/rules/never-echo-secrets.mdc).

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
- Verification: `npm run lint` plus `npm run build` and manual checks. Post-staging CD runs `npm run test:smoke` and profile-based journeys (`test:journey` or `test:journey:content`); prod reuses the same build artifact, then **Smoke Production** (`TEST-D-003`; failure pages Sev1 SMS+voice) — see [`docs/runbooks/testing-strategy.md`](docs/runbooks/testing-strategy.md).
- Content is markdown under `src/content/` (`shows`, `news`, `gallery`, `pages`, `casting`) with Zod schemas in `src/content.config.ts`. Adding a markdown file adds a live route (e.g. a new `src/content/news/*.md` appears on `/news` and `/news/<id>`).
- **Removed pages / URLs:** Whenever a public page or content route is removed, renamed, or otherwise stops serving at its old path, add a **301 redirect** in [`public/staticwebapp.config.json`](public/staticwebapp.config.json) (and mirror in root [`staticwebapp.config.json`](staticwebapp.config.json)) from the old URL to the best remaining equivalent. One hop only; list each path once (SWA treats `/path` and `/path/` as duplicates — prefer slashless). Do not leave public 404s for known old links — see [`docs/runbooks/wordpress-to-azure-cutover.md`](docs/runbooks/wordpress-to-azure-cutover.md).
- **Featured shows:** Set `featured: true` only on headline credits. The homepage always shows the **three most recent** featured shows by `year`, then `order` (lower = newer within a year) via [`src/lib/shows.ts`](src/lib/shows.ts) (`getFeaturedShowsForHome`). When adding a new featured credit, mark it featured and set `order` so newer months sort first — it will surface on home automatically if it is among the three newest.
- **Resume PDF:** Generated from `src/content/shows/*.md` + [`src/content/resume-meta.json`](src/content/resume-meta.json) by [`scripts/generate-resume-pdf.mjs`](scripts/generate-resume-pdf.mjs). Theater = musical/play/cabaret; film = `category: film`. Featured first within each section, then year/order. Show `venue` should be `[Theater Name] - [City], [ST]` (room/program context goes in the show body). Run `npm run resume:pdf` after show edits (or rely on `npm run build`, which always regenerates before shipping). Commit the updated `public/downloads/elyse-tindall-resume.pdf` when shows change so the repo artifact stays reviewable.

### Public SEO & analytics
Phased GSC + GA4 work: [`docs/plans/search-and-analytics.md`](docs/plans/search-and-analytics.md) (`SEARCH-*`). Keep that plan and this section current when changing the contracts below (see [`.cursor/rules/search-seo.mdc`](.cursor/rules/search-seo.mdc)).

- **GA4 (Phase 1):** Load only on public pages via `src/scripts/ga.ts` / `src/lib/analytics.ts`. Skip `/studio` and `noIndex` pages. Events: `generate_lead`, `file_download`, `select_content` (`trackGaEvent` / `data-ga-*`). App Insights stays Studio/ops — do not send Studio diagnostics to GA. Consent Mode banner is `wont_fix` unless reopened deliberately.
- **Titles (Phase 2):** Pages pass bare titles; [`BaseLayout`](src/layouts/BaseLayout.astro) appends ` · Elyse Tindall` (strips legacy `| Elyse Tindall`). Casting frontmatter must not embed the brand — [`add-casting-page.md`](docs/runbooks/add-casting-page.md). Casting `/for/*` landers: body markdown only above the layout’s **Related credits** block — do not add CTAs, casting-index, or Materials links below Related credits (footer owns those).
- **JSON-LD:** [`Seo.astro`](src/components/Seo.astro) prepends default `Person` when custom `jsonLd` lacks a top-level / `@graph` Person (nested `about`/`founder` do not count). Prefer slashless URLs in JSON-LD and canonicals.
- **Crawlers:** Sitemap filters `/studio`; `noIndex` on Studio; `Disallow: /studio` in [`public/robots.txt`](public/robots.txt). Default OG: [`public/images/og-default.jpg`](public/images/og-default.jpg) (1200×630) with width/height/alt when used. Journey coverage: `tests/journeys/seo.spec.ts` (`J-SEO-01`).
- **Monthly search ops (Phase 3–4):** SoT artifact [`docs/ops/search-signals/`](docs/ops/search-signals/) via `SEARCH-P4-002` (`.github/workflows/search-ops-monthly.yml`); GSC API setup [gsc-data-api-access.md](docs/runbooks/gsc-data-api-access.md). Manual fallback: [`search-ops-monthly.md`](docs/runbooks/search-ops-monthly.md). Casting lander drafts: `DISC-P4-*` in [`casting-discoverability.md`](docs/plans/casting-discoverability.md) — use **`GEMINI_MODEL_SEARCH_OPS`** (`gemini-3.5-flash`), not Studio’s `GEMINI_MODEL` (`gemini-3.6-flash`); per-model limits **5 RPM / 20 RPD** (see [`cost-and-quotas.md`](docs/runbooks/cost-and-quotas.md)). Does not replace ops scorecard activity (`OPS-P5-*`).

### Studio API (`api/`, optional local)
- Requires **Azure Functions Core Tools** (`func`), which is present in the Cursor Cloud base image (v4) but is NOT part of `npm` deps and NOT installed by the update script. If it is ever missing, install it separately (`npm i -g azure-functions-core-tools@4`).
- Copy `api/local.settings.json.example` → `api/local.settings.json` (gitignored), then run `func start` (port 7071). Endpoints: `POST /api/updateContent`, `POST /api/uploadMedia`.
- With `AZURE_FUNCTIONS_ENVIRONMENT=Development` (already set in the example settings) the SWA auth allowlist check is skipped, so endpoints are callable locally without SWA auth. However `updateContent` still needs `GEMINI_API_KEY` and GitHub App creds (or `GITHUB_TOKEN`) to actually publish — without them it returns a sanitized 500 plus `correlationId` (not the raw missing-key string).
- **Publish mode:** Staging SWA sets `STUDIO_PUBLISH_MODE=pr` (dated `staging-studio-YYYYMMDD` branch + PR into `main`); prod uses `direct` (commit to `GITHUB_BRANCH`). See [github-app.md](docs/runbooks/github-app.md#staging-studio-publish-pr-mode). Local default in `api/local.settings.json.example` is `direct`.
- Default Studio model is `gemini-3.6-flash` (`GEMINI_MODEL`). Search ops / lander drafts use a **separate** model env `GEMINI_MODEL_SEARCH_OPS` (default `gemini-3.5-flash`) — quotas are **independent** per model. Do not reinstate shut-down IDs such as `gemini-2.0-flash`.
- `astro dev` alone does NOT proxy `/api/*` to Functions on :7071. For full local Studio testing, use the Azure SWA CLI or call port 7071 directly.

### Studio errors (user-facing + support)

- **Never** return raw provider/SDK/`err.message` strings to the Studio UI for 500/503 paths. Use [`api/src/lib/httpErrors.js`](api/src/lib/httpErrors.js) so responses are friendly copy + **`correlationId`**.
- Full diagnostics live in Function logs and App Insights (`StudioPublishFailed`, exceptions) keyed by that ID — see [`docs/runbooks/observability.md`](docs/runbooks/observability.md).
- Studio UI should show the friendly message and `Reference: {correlationId}` (same pattern as allowlist denials).
- When changing Studio API error handling, keep this contract; do not put HTTP/correlation rules into the Gemini `systemInstruction`.

### Operational excellence

Phased backlog: [`docs/plans/operational-excellence.md`](docs/plans/operational-excellence.md) (`OPS-*`) — reliability scorecard, SLOs, Sev1 SMS/voice, monthly scorecard refresh + ACS digest, subscription budget = **ceil(expected retail × 1.25)** (currently **$34/mo**; alert at **80%**/100% Actual). Committed SLO targets include homepage/materials availability **99.8%/7d**, homepage FCP p75 **&lt;1.5s**, Studio publish **95%/28d**, publish→live p95 **≤20m**. Phase 0–5 (except optional PagerDuty `OPS-P3-002`) are done. **Phase 5** site performance (visits / top pages from GA4 Data API, contacts / Studio updates from App Insights) lands in the scorecard + digest — `GA-*` secrets populated in `kv-elyse-shared` per [`docs/runbooks/ga-data-api-access.md`](docs/runbooks/ga-data-api-access.md); confirm next monthly run clears visits/`stale`. **Do not implement** `OPS-P3-002` until explicitly requested.

Living scorecard: [`docs/ops/operational-excellence-scorecard.md`](docs/ops/operational-excellence-scorecard.md). Monthly Actions workflow (`.github/workflows/ops-scorecard-monthly.yml`) re-evaluates, commits to `main` via the Studio GitHub App, probes subscription spend/MoM + site performance, and emails an ACS digest to `ALERT-EMAIL` + `SITE-CONTACT-EMAIL` (`OPS-P0-003` / `OPS-P0-004` / `OPS-P4-002` / `OPS-P5-*`; CD ignores scorecard-only pushes). On workflow failure, ACS emails **`ALERT-EMAIL` only**. Refresh locally with `node scripts/ops-scorecard-refresh.mjs`. Local digest: `npm run ops:scorecard-email` after KV env is loaded.

**Azure cost sync:** When adding/removing Azure resources, recalculate retail expected cost for deployed region(s), update [`docs/runbooks/cost-and-quotas.md`](docs/runbooks/cost-and-quotas.md), and set bootstrap budget to **ceil(expected × 1.25)** with **80%** Actual alert — see [`.cursor/rules/ops-operational-excellence.mdc`](.cursor/rules/ops-operational-excellence.mdc).

**Private ops contacts:** Never commit alert emails, support/SMS/voice numbers, or vendor routing keys. Store them in Key Vault and read at apply/deploy time (same SoT pattern as [`docs/runbooks/rotate-secrets.md`](docs/runbooks/rotate-secrets.md)). Use `ALERT-*` secrets in **`kv-elyse-shared`** (bootstrap); do not reuse `SITE-CONTACT-*` / ACS inquiry SMS for on-call. See [`.cursor/rules/ops-operational-excellence.mdc`](.cursor/rules/ops-operational-excellence.mdc).
