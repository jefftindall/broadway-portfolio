See README.md and docs/ for project guidance.

## Cursor Cloud specific instructions

Single-product Astro portfolio + optional Gemini-powered "Studio" Azure Functions API. Node >= 22.12 is required (see root `package.json` engines). Dependencies for the root site and `api/` are installed automatically by the startup update script (`npm ci` in both).

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

Requirements for Terraform lint locally: Terraform >= 1.5 and [TFLint](https://github.com/terraform-linters/tflint) on `PATH` (`tflint --init` uses [`infra/.tflint.hcl`](infra/.tflint.hcl)). Do not commit if lint fails; do not skip these checks.

### Public site (primary service)
- Dev server: `npm run dev` (Astro, serves on port 4321). Build: `npm run build` (static output to `dist/`).
- Verification: `npm run lint` plus `npm run build` and manual smoke tests. There is no separate unit-test runner.
- Content is markdown under `src/content/` (`shows`, `news`, `gallery`, `pages`, `casting`) with Zod schemas in `src/content.config.ts`. Adding a markdown file adds a live route (e.g. a new `src/content/news/*.md` appears on `/news` and `/news/<id>`).

### Studio API (`api/`, optional local)
- Requires **Azure Functions Core Tools** (`func`) which is NOT part of `npm` deps and NOT installed by the update script — install it separately (`npm i -g azure-functions-core-tools@4`) if you need to run the API.
- Copy `api/local.settings.json.example` → `api/local.settings.json` (gitignored), then run `func start` (port 7071). Endpoints: `POST /api/updateContent`, `POST /api/uploadMedia`.
- With `AZURE_FUNCTIONS_ENVIRONMENT=Development` (already set in the example settings) the SWA auth allowlist check is skipped, so endpoints are callable locally without SWA auth. However `updateContent` still needs `GEMINI_API_KEY` and GitHub App creds (or `GITHUB_TOKEN`) to actually publish — without them it returns `500 Missing GEMINI_API_KEY`.
- `astro dev` alone does NOT proxy `/api/*` to Functions on :7071. For full local Studio testing, use the Azure SWA CLI or call port 7071 directly.
