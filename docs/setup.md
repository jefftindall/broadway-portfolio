# Initial setup

This guide provisions Azure with Terraform (bootstrap + staging/prod), connects GitHub, stores secrets in Key Vault, and cuts DNS over to the new site.

## Prerequisites

- Azure subscription **`e601e59a-c7f4-41f0-8178-b59740fb1974`** (default for `subscription_id` in all stacks; also pinned in remote backends, which cannot use Terraform variables) + Owner or Contributor on that subscription
- Azure CLI (`az login` and confirm: `az account set --subscription e601e59a-c7f4-41f0-8178-b59740fb1974`)
- Terraform >= 1.5
- Ability to register these Resource Providers on the subscription (or have an Owner do it once): `Microsoft.Resources`, `Microsoft.Storage`, `Microsoft.KeyVault`, `Microsoft.Web`, `Microsoft.Authorization`
- GitHub repo for this project
- Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey)). Studio defaults to `gemini-3.6-flash` (`GEMINI_MODEL`); search-ops / lander drafts use `GEMINI_MODEL_SEARCH_OPS` (default `gemini-3.5-flash`) with independent quotas. Do not use shut-down IDs such as `gemini-2.0-flash`.
- Permission to create a GitHub App on the account that owns this repo (Studio writes via App installation tokens — see [github-app.md](runbooks/github-app.md))
- `gh` CLI authenticated (so Terraform can set Actions environment variables via `GH_TOKEN`)
- Access to DNS for `elysetindall.com`
- Permission to create Entra ID app registrations in the tenant (Studio login + GitHub Actions OIDC)

## Layout

| Path | Purpose |
|------|---------|
| [`infra/bootstrap`](../infra/bootstrap) | Creates remote state storage + Terraform OIDC identity (**local** Terraform state, run once) |
| [`infra/environments/staging`](../infra/environments/staging) | Staging SWA + Key Vault |
| [`infra/environments/prod`](../infra/environments/prod) | Production SWA + Key Vault + custom domain |
| [`infra/modules/portfolio`](../infra/modules/portfolio) | Shared module used by both environments |

All app resources include the environment in their names (`rg-elyse-portfolio-staging`, `kv-elyse-prod`, etc.) so staging and prod never collide.

**Region:** All resources use **East US 2** (`eastus2`), including Static Web Apps, Key Vault, and Terraform state storage.

## 1. Bootstrap Terraform remote state + Terraform OIDC (once, local state)

```bash
export GH_TOKEN="$(gh auth token)"   # needs admin access to repo variables
cd infra/bootstrap
terraform init -input=false
terraform plan -input=false -out=tfplan
terraform apply tfplan
```

This creates (expected values already wired into staging/prod backends):

| Resource | Name |
|----------|------|
| Resource group | `rg-elyse-tfstate` |
| Storage account | `stelysetfstateeu2` |
| Container | `tfstate` |
| Location | `eastus2` |
| Entra app (Terraform CI/CD) | `elyse-portfolio-gha-terraform` |

State file keys (separate per environment):

- Staging: `broadway-portfolio/staging.tfstate`
- Prod: `broadway-portfolio/prod.tfstate`

When `manage_github_actions = true`, bootstrap also sets repository variables:

| Variable | Purpose |
|---|---|
| `AZURE_TF_CLIENT_ID` | Terraform OIDC Entra app client ID |
| `AZURE_TF_TENANT_ID` | Directory (tenant) ID |
| `AZURE_TF_SUBSCRIPTION_ID` | Target subscription |

These are distinct from the per-environment `AZURE_CLIENT_ID` used for SWA deploy. Re-apply bootstrap after pulling OIDC changes so Actions can run Terraform.

Keep the bootstrap local `terraform.tfstate` backed up (or migrate it later); it is gitignored.

## 2. Apply an environment

### Staging

```bash
cd infra/environments/staging
terraform init -input=false
terraform plan -input=false -out=tfplan
terraform apply tfplan
```

Creates e.g. `rg-elyse-portfolio-staging`, `kv-elyse-staging`, `swa-elyse-portfolio-staging`.

All inputs have working defaults, including `jefftindall/broadway-portfolio`; no
`terraform.tfvars` file is required. Copy `terraform.tfvars.example` only when
you need to override a default.

### Prod

```bash
cd infra/environments/prod
terraform init -input=false
terraform plan -input=false -out=tfplan
terraform apply tfplan
```

Creates e.g. `rg-elyse-portfolio-prod`, `kv-elyse-prod`, `swa-elyse-portfolio-prod`.
Production defaults to `elysetindall.com` and
`jefftindall/broadway-portfolio`.

Save outputs per environment: `static_web_app_default_hostname`, `github_actions_client_id`, and for prod `custom_domain_validation_token`. Env vaults are `kv-elyse-staging` / `kv-elyse-prod`; shared build secrets are `kv-elyse-shared` (bootstrap).

Before apply, authenticate the GitHub provider so Terraform can create Actions environments/variables:

```bash
export GH_TOKEN="$(gh auth token)"   # needs admin access to repo variables/environments
```

Set `manage_github_actions = false` only if you will create the GitHub Environment variables by hand.

## 3. Populate Key Vault secrets

Never commit these values. Vaults created by Terraform:

| Environment | Key Vault |
|---|---|
| Staging | `kv-elyse-staging` |
| Production | `kv-elyse-prod` |

### Shared app settings (run for each vault)

```bash
# Staging
az keyvault secret set --vault-name kv-elyse-staging --name GEMINI-API-KEY --value "<gemini-key>"
az keyvault secret set --vault-name kv-elyse-staging --name ALLOWED-USER-IDS --value "<elyse-email-or-userId>"

# Production
az keyvault secret set --vault-name kv-elyse-prod --name GEMINI-API-KEY --value "<gemini-key>"
az keyvault secret set --vault-name kv-elyse-prod --name ALLOWED-USER-IDS --value "<elyse-email-or-userId>"
```

Studio talks to GitHub via a **GitHub App** (not a PAT). Follow [github-app.md](runbooks/github-app.md) to create the App, then:

```bash
# Staging
az keyvault secret set --vault-name kv-elyse-staging --name GITHUB-APP-ID --value "<app-id>"
az keyvault secret set --vault-name kv-elyse-staging --name GITHUB-APP-INSTALLATION-ID --value "<installation-id>"
az keyvault secret set --vault-name kv-elyse-staging --name GITHUB-APP-PRIVATE-KEY --file ./path/to/app.pem

# Production
az keyvault secret set --vault-name kv-elyse-prod --name GITHUB-APP-ID --value "<app-id>"
az keyvault secret set --vault-name kv-elyse-prod --name GITHUB-APP-INSTALLATION-ID --value "<installation-id>"
az keyvault secret set --vault-name kv-elyse-prod --name GITHUB-APP-PRIVATE-KEY --file ./path/to/app.pem
```

`ALLOWED_USER_IDS` is a comma-separated list matching SWA principal `userId`, `userDetails`, or email claim (lowercase).

After first login to `/studio`, check `/.auth/me` while signed in to copy the exact `userId` / email into the allowlist.

**Important:** SWA managed Functions do **not** resolve `@Microsoft.KeyVault(...)` app settings. After populating the vault (or whenever you change API secrets), sync resolved values into SWA with `./scripts/sync-swa-api-secrets.sh <staging|prod>`, the **Ops: sync SWA secrets** workflow, or `terraform apply` for that environment. `AAD_CLIENT_SECRET` stays a Key Vault reference (auth platform only). See [rotate-secrets.md](runbooks/rotate-secrets.md).

Contact forms and the single CD build use **shared** Key Vault `kv-elyse-shared` (SITE-*, Turnstile, ACS). Env vaults keep Gemini / GitHub App / allowlist / AAD. Apply bootstrap first (shared ACS in `rg-elyse-shared`), populate shared secrets, then sync SWA — see [rotate-secrets.md](runbooks/rotate-secrets.md).

## 4. GitHub Actions OIDC (no deploy-token secret)

### App deploy identity (per environment)

Terraform creates an Entra app `elyse-portfolio-gha-<env>` with federated credentials for GitHub OIDC, plus (when `manage_github_actions = true`) a GitHub Environment (`staging` / `prod`) with:

| Variable | Purpose |
|---|---|
| `AZURE_CLIENT_ID` | Federated Entra app client ID (SWA deploy only) |
| `AZURE_TENANT_ID` | Directory (tenant) ID |
| `AZURE_SUBSCRIPTION_ID` | Target subscription |
| `AZURE_RESOURCE_GROUP` | Environment resource group |
| `AZURE_STATIC_WEB_APP_NAME` | SWA name for `az staticwebapp secrets list` |

The workflow ([azure-static-web-apps.yml](../.github/workflows/azure-static-web-apps.yml)) uses `azure/login` with OIDC, fetches the SWA deploy key at runtime, and deploys. **Do not** store `AZURE_STATIC_WEB_APPS_API_TOKEN` in GitHub secrets.

### Terraform identity (shared, from bootstrap)

Bootstrap creates `elyse-portfolio-gha-terraform` with subscription Contributor / User Access Administrator, Key Vault Secrets Officer, Storage Blob Data Contributor on tfstate, and Cloud Application Administrator so CI can plan/apply env stacks. Repo variables `AZURE_TF_*` point at this app.

Terraform also manages GitHub Environment variables. The default Actions `GITHUB_TOKEN` cannot read those, so add a repository secret **`TF_GITHUB_TOKEN`**: a classic PAT with `repo` scope, or a fine-grained PAT with Environments + Variables read/write on this repo. Workflows override `GITHUB_TOKEN` with that secret for Terraform steps.

| Workflow | Display name | When | What |
|---|---|---|---|
| [static-analysis.yml](../.github/workflows/static-analysis.yml) | **CI: static analysis** | Every PR / push to `main` | fmt, TFLint, validate, Astro check, API syntax; then (on PRs that touch `infra/`) `terraform plan` for staging and prod after those checks succeed — **no deploys**; CI runs in parallel across PRs (no concurrency group) |
| [azure-static-web-apps.yml](../.github/workflows/azure-static-web-apps.yml) | **CD: main** | Push / merge to `main` when app or infra paths change; manual (`workflow_dispatch`) from `main` runs full CD | Single **Build release**; if `infra/` changed: apply staging (parallel with build) → deploy staging → change-aware smoke/journeys → apply prod → deploy prod (same artifact); if only app paths changed: build → deploy staging → verify → prod; docs-only pushes skip CD; manual dispatch from non-`main` branches runs staging only. Shares `concurrency: portfolio-cd` with **CD: staging** (`cancel-in-progress: false`) so only one CD run deploys at a time |
| [staging-branch.yml](../.github/workflows/staging-branch.yml) | **CD: staging** | Manual (`workflow_dispatch`) | Apply staging Terraform from the selected branch, deploy the staging SWA, then run Playwright smoke + journeys (async test; no prod). Same `portfolio-cd` concurrency group as main CD. Use this to preview Studio `staging-studio-YYYYMMDD` branches before merging their PR |
| [cleanup-staging-studio-branches.yml](../.github/workflows/cleanup-staging-studio-branches.yml) | **Maint: cleanup Studio branches** | Daily cron + manual | Deletes `staging-studio-YYYYMMDD` branches older than 28 days (UTC) |

Naming SoT: [runbooks/github-actions-naming.md](runbooks/github-actions-naming.md) (Scheme A). File renames are tracked as tech debt there.

Promotion path:

- Pull requests → **CI: static analysis** only (plan when infra changes); no app or infra deploy
- Push / merge to `main` → **CD: main** runs only when app or infra paths change (`src/`, `public/`, `api/`, build config, `infra/`, etc.); **docs-only** and other non-release paths skip deploy jobs. Terraform apply runs when `infra/` changes; **Smoke Staging** after staging deploy; prod only if staging deploy **and** verification succeeded; **Smoke Production** after prod deploy (failure → Sev1 SMS+voice, no auto-rollback)
- Manual branch test → Actions → **CD: staging** → pick the branch → Run workflow (includes smoke + journeys)

See [runbooks/testing-strategy.md](runbooks/testing-strategy.md) for persona journeys, local commands, and phased backlog.

Branch protection should require **CI: static analysis** jobs (Terraform lint / Site check / API syntax) before merge. Optionally add required reviewers on the `prod` environment for a manual gate after staging smoke.

Verify subjects if login fails (must match GitHub’s assertion, including numeric IDs):

```bash
# Deploy identity (from env stack)
terraform output github_actions_oidc_subjects
# e.g. repo:jefftindall@10339968/broadway-portfolio@1312787625:environment:staging

# Terraform identity (from bootstrap)
cd infra/bootstrap && terraform output terraform_oidc_subjects
```

If Actions reports `AADSTS700213` with a different subject, update `github_owner_id` / `github_repo_id` and re-apply.

Terraform also provisions Application Insights + Log Analytics per environment, sets `APPLICATIONINSIGHTS_CONNECTION_STRING` on the SWA, and publishes GitHub Environment variable `APPINSIGHTS_CONNECTION_STRING` for the browser SDK and deploy telemetry. It also publishes `GA_MEASUREMENT_ID` (default `G-XEE29C0RRE`) for Google Analytics 4 builds (`PUBLIC_GA_MEASUREMENT_ID`). Metric alerts use shared Key Vault `ALERT-*` contacts (see [runbooks/rotate-secrets.md](runbooks/rotate-secrets.md)); set those secrets then `terraform apply` — do not pass emails/phones as Terraform variables.

See [runbooks/observability.md](runbooks/observability.md).

## 5. Authentication (Entra ID — provisioned by Terraform)

The Entra app registration is **defined in Terraform** ([`infra/modules/portfolio/entra.tf`](../infra/modules/portfolio/entra.tf)), one per environment. Each apply creates:

- `azuread_application` `elyse-portfolio-<env>` (single-tenant, `AzureADMyOrg`)
- A service principal with **user assignment required**
- A client secret stored in Key Vault as `AAD-CLIENT-SECRET`
- SWA app settings `AAD_CLIENT_ID`, `AAD_TENANT_ID`, and a Key Vault reference for `AAD_CLIENT_SECRET` (Studio API secrets are written as resolved values from Key Vault at apply/sync time)

### Redirect URIs

Registered automatically for both the Azure-generated hostname and your custom DNS:

```bash
terraform output entra_redirect_uris
```

Prod example:

| Hostname | Redirect URI |
|---|---|
| Azure default | `https://<name>.azurestaticapps.net/.auth/login/aad/callback` |
| Custom apex | `https://elysetindall.com/.auth/login/aad/callback` |
| Custom www | `https://www.elysetindall.com/.auth/login/aad/callback` (included automatically when `custom_domain` is set) |

Add more via `additional_auth_hostnames` in `terraform.tfvars`.

### Assign Elyse to the app

Because `require_app_role_assignment = true`, she must be assigned before she can sign in:

Azure Portal → **Entra ID → Enterprise applications → `elyse-portfolio-prod` → Users and groups → Add user**.

### Pin the token issuer (recommended)

[`staticwebapp.config.json`](../staticwebapp.config.json) ships with a tenant-agnostic issuer so first deploy works. Cache-Control routes in that file (mirrored under `public/`) are explained in [swa-caching.md](runbooks/swa-caching.md). Harden the issuer by replacing `common` with your tenant:

```bash
terraform output -raw entra_openid_issuer
# https://login.microsoftonline.com/<tenant-id>/v2.0
```

The registration is single-tenant and the API enforces the Key Vault allowlist, so publishing stays locked to Elyse either way.

### Verify

1. Anonymous request to `/studio` redirects to Entra login
2. Anonymous `POST /api/updateContent` returns 401/302
3. Signing in as Elyse reaches Studio; any other account is rejected

## 6. Custom domain / DNS cutover (prod only)

Full procedure (Namecheap EasyWP → Azure, legacy 301s, search consoles, decommission): [WordPress → Azure cutover runbook](runbooks/wordpress-to-azure-cutover.md).

Summary:

1. Prod Terraform already sets `custom_domain = "elysetindall.com"`
2. Create the TXT validation record from `custom_domain_validation_token` (see [dns-and-domain runbook](runbooks/dns-and-domain.md))
3. Deploy legacy WordPress 301s via `public/staticwebapp.config.json` (staging → smoke → prod) before flipping DNS
4. In Namecheap Advanced DNS, replace EasyWP apex/`www` records with Azure SWA ALIAS/A + CNAME; apply Terraform so www is bound, then set apex as the default custom domain in Portal (www → apex 301)
5. Verify HTTPS, redirects, and that EasyWP no longer serves apex traffic
6. Smoke-test: home, shows, lessons, a `/for/...` page, and authenticated Studio publish

## 7. First authenticated publish test

1. Visit `https://elysetindall.com/studio` (prod) or the staging SWA hostname
2. Sign in as Elyse
3. Send: `Add a news post that I completed a showcase this week`
4. Confirm a commit appears on `main` and GitHub Actions deploys within ~5 minutes
5. Confirm the live page updates

## Local development

```bash
npm install && npm run dev
```

For API locally, copy `api/local.settings.json.example` → `api/local.settings.json` and run Azure Functions Core Tools. Auth allowlist is relaxed when `AZURE_FUNCTIONS_ENVIRONMENT=Development`.
