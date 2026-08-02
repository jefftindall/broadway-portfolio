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

### Public site (primary service)
- Dev server: `npm run dev` (Astro, serves on port 4321). Build: `npm run build` (static output to `dist/`).
- Verification: `npm run lint` plus `npm run build` and manual smoke tests. There is no separate unit-test runner.
- Content is markdown under `src/content/` (`shows`, `news`, `gallery`, `pages`, `casting`) with Zod schemas in `src/content.config.ts`. Adding a markdown file adds a live route (e.g. a new `src/content/news/*.md` appears on `/news` and `/news/<id>`).

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
