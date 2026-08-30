# Elyse Tindall Portfolio

Astro portfolio for [elysetindall.com](https://elysetindall.com) with an authenticated Studio (voice/text content publish and People/CRM; more teaching-business ops over time), Azure Static Web Apps hosting, Terraform infrastructure, and Key Vault–backed secrets.

## Features

- Public site: Shows, Materials, Lessons, About, News, Contact (Gallery linked from About + footer); private voice Lessons (vocal pedagogy / CCM)
- Casting SEO landing pages at `/for/[slug]` (inbound from search; not linked from site chrome)
- Private `/studio` companion (auth required) — home chooser; Gemini publish at `/studio/content`; `/studio/people` CRM (Table Storage); Access at `/studio/admin/access`; later calendar, pay status, and comms
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

- [Authentication and authorization](docs/architecture/authentication-authorization.md) — login vs permission catalog, Super Administrator vs Azure/Entra Owner
- [Data persistence](docs/architecture/data-persistence.md) — stores, models, relations, and access-flow diagrams (keep current when those change; [`.cursor/rules/data-persistence.mdc`](.cursor/rules/data-persistence.mdc))
- [Initial setup](docs/setup.md) — Terraform, secrets, GitHub App, OIDC, DNS cutover
- [Casting discoverability backlog](docs/plans/casting-discoverability.md) — assessment rubric, scores, and `DISC-*` action IDs for SEO/casting work
- [Search Console & Analytics plan](docs/plans/search-and-analytics.md) — phased GSC + GA4 work (`SEARCH-*` action IDs)
- [Brand & UI style guide](docs/style-guide.md) — tokens, type, components (visual: `/style-guide`)
- Plans:
  - [Lesson payments](docs/plans/lesson-payments.md) — vendor comparison and phased checkout
  - [Studio as teaching business](docs/plans/studio-teaching-business.md) — auth-only ops north star + `STUDIO-*` CRM / GCal / automation phases
  - [Contact accounts](docs/plans/contact-accounts.md) — student/parent Google / Apple / Microsoft login, `/account` history, flag-gated schedule/book (`ACCOUNT-*`); inquire stays anonymous
- Runbooks:
  - [GitHub Actions naming (Scheme A)](docs/runbooks/github-actions-naming.md) — display names + file-rename tech debt
  - [GitHub App (Studio)](docs/runbooks/github-app.md)
  - [Rotate secrets](docs/runbooks/rotate-secrets.md)
  - [Deploy and rollback](docs/runbooks/deploy-and-rollback.md)
  - [SWA caching](docs/runbooks/swa-caching.md) — Cache-Control, why deploys stay fresh, when to flush
  - [Manage access](docs/runbooks/manage-access.md)
  - [Add casting page](docs/runbooks/add-casting-page.md)
  - [Troubleshoot build](docs/runbooks/troubleshoot-build.md)
  - [DNS and domain](docs/runbooks/dns-and-domain.md)
  - [WordPress (EasyWP) → Azure cutover](docs/runbooks/wordpress-to-azure-cutover.md)
  - [Cost and quotas](docs/runbooks/cost-and-quotas.md)
  - [Monthly site check-in email](docs/runbooks/monthly-site-check-in.md) — how to read the monthly digest (for Elyse)
  - [Observability](docs/runbooks/observability.md)
  - [Refine Studio Gemini instructions](docs/runbooks/refine-studio-gemini.md)

## Security model

Authentication and authorization are separate. Anyone in the Entra tenant can sign in; actions require catalog permissions on a Studio user profile.

1. SWA routes protect `/studio` and `/api/*` (`authenticated` login gate). Entra **Assignment required** stays off so login is not blocked with `AADSTS50105`.
2. API never treats a signed-in principal as permission to act. Publish, People, and Access re-check `x-ms-client-principal` against the permission catalog (`content.publish`, `people.read` / `people.write`, `users.manage`). User profiles are the source of truth; `ALLOWED_USER_IDS` only bootstraps a missing Super Administrator profile. Public exceptions use Turnstile, sanitized Payment Links, or Stripe signatures.
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
