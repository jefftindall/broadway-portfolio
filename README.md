# Elyse Tindall Portfolio

Astro portfolio for [elysetindall.com](https://elysetindall.com) with a Gemini-powered Studio for voice/text content updates, Azure Static Web Apps hosting, Terraform infrastructure, and Key Vault–backed secrets.

## Features

- Public site: Shows, Materials, Lessons, About, News, Contact (Gallery linked from About + footer); private voice Lessons (vocal pedagogy / CCM)
- Casting SEO landing pages at `/for/[slug]`
- Private `/studio` companion (auth required) — natural language updates via Gemini → GitHub commits → SWA rebuild
- Terraform for Azure (bootstrap + staging/prod, Key Vault, Entra auth, GitHub Actions OIDC)
- Studio publishes via **GitHub App** installation tokens (no PAT)
- Docs for setup and ongoing maintenance

## Quick start (local)

```bash
npm install
npm run dev
```

### Lint / static analysis

```bash
npm run lint
```

Runs Terraform fmt + TFLint + validate, `astro check`, and API syntax checks. The same gates run on every PR via [`.github/workflows/static-analysis.yml`](.github/workflows/static-analysis.yml). Agents must run this before committing (see [AGENTS.md](AGENTS.md)).

API functions (optional local):

```bash
cd api
cp local.settings.json.example local.settings.json
# fill secrets
npm install
# requires Azure Functions Core Tools
func start
```

## Documentation

- [Initial setup](docs/setup.md) — Terraform, secrets, GitHub App, OIDC, DNS cutover
- [Casting discoverability backlog](docs/casting-discoverability.md) — assessment rubric, scores, and `DISC-*` action IDs for SEO/casting work
- [Search Console & Analytics plan](docs/plans/search-and-analytics.md) — phased GSC + GA4 work (`SEARCH-*` action IDs)
- [Brand & UI style guide](docs/style-guide.md) — tokens, type, components (visual: `/style-guide`)
- Runbooks:
  - [GitHub App (Studio)](docs/runbooks/github-app.md)
  - [Rotate secrets](docs/runbooks/rotate-secrets.md)
  - [Deploy and rollback](docs/runbooks/deploy-and-rollback.md)
  - [Manage access](docs/runbooks/manage-access.md)
  - [Add casting page](docs/runbooks/add-casting-page.md)
  - [Troubleshoot build](docs/runbooks/troubleshoot-build.md)
  - [DNS and domain](docs/runbooks/dns-and-domain.md)
  - [WordPress (EasyWP) → Azure cutover](docs/runbooks/wordpress-to-azure-cutover.md)
  - [Cost and quotas](docs/runbooks/cost-and-quotas.md)
  - [Observability](docs/runbooks/observability.md)
  - [Refine Studio Gemini instructions](docs/runbooks/refine-studio-gemini.md)

## Security model

Only Elyse can publish:

1. SWA routes protect `/studio` and `/api/*` (authenticated)
2. API re-checks `x-ms-client-principal` against `ALLOWED_USER_IDS` (Key Vault source of truth, synced into SWA app settings for managed Functions)
3. GitHub writes use short-lived **GitHub App** installation tokens (private key in Key Vault, synced into SWA)
4. GitHub Actions uses **OIDC** to Azure (separate identities for SWA deploy vs Terraform; no long-lived deploy token in repo secrets)

## Infrastructure

| Path | Purpose |
|------|---------|
| `infra/bootstrap` | Remote state storage + Terraform OIDC identity (local Terraform state, East US 2) |
| `infra/environments/staging` | Staging stack |
| `infra/environments/prod` | Production stack + `elysetindall.com` |
| `infra/modules/portfolio` | Shared SWA + Key Vault module |

See [docs/setup.md](docs/setup.md).

## Content

Editable markdown lives in `src/content/` (`shows`, `news`, `pages`, `gallery`, `casting`). Photos go under `public/images/photos/` (Studio uploads) or `src/assets/` for build-time optimization later.
