# Initial setup

This guide provisions Azure with Terraform (bootstrap + staging/prod), connects GitHub, stores secrets in Key Vault, and cuts DNS over to the new site.

## Prerequisites

- Azure subscription **`e601e59a-c7f4-41f0-8178-b59740fb1974`** (default for `subscription_id` in all stacks; also pinned in remote backends, which cannot use Terraform variables) + Owner or Contributor on that subscription
- Azure CLI (`az login` and confirm: `az account set --subscription e601e59a-c7f4-41f0-8178-b59740fb1974`)
- Terraform >= 1.5
- Ability to register these Resource Providers on the subscription (or have an Owner do it once): `Microsoft.Resources`, `Microsoft.Storage`, `Microsoft.KeyVault`, `Microsoft.Web`, `Microsoft.Authorization`
- GitHub repo for this project
- Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey))
- Permission to create a GitHub App on the account that owns this repo (Studio writes via App installation tokens — see [github-app.md](runbooks/github-app.md))
- `gh` CLI authenticated (so Terraform can set Actions environment variables via `GH_TOKEN`)
- Access to DNS for `elysetindall.com`
- Permission to create Entra ID app registrations in the tenant (Studio login + GitHub Actions OIDC)

## Layout

| Path | Purpose |
|------|---------|
| [`infra/bootstrap`](../infra/bootstrap) | Creates remote state storage (**local** Terraform state, run once) |
| [`infra/environments/staging`](../infra/environments/staging) | Staging SWA + Key Vault |
| [`infra/environments/prod`](../infra/environments/prod) | Production SWA + Key Vault + custom domain |
| [`infra/modules/portfolio`](../infra/modules/portfolio) | Shared module used by both environments |

All app resources include the environment in their names (`rg-elyse-portfolio-staging`, `kv-elyse-prod`, etc.) so staging and prod never collide.

**Region:** All resources use **East US 2** (`eastus2`), including Static Web Apps, Key Vault, and Terraform state storage.

## 1. Bootstrap Terraform remote state (once, local state)

```bash
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

State file keys (separate per environment):

- Staging: `broadway-portfolio/staging.tfstate`
- Prod: `broadway-portfolio/prod.tfstate`

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

Save outputs per environment: `static_web_app_default_hostname`, `github_actions_client_id`, and for prod `custom_domain_validation_token`. Key Vaults are always `kv-elyse-staging` and `kv-elyse-prod`.

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

## 4. GitHub Actions OIDC (no deploy-token secret)

Terraform creates an Entra app `elyse-portfolio-gha-<env>` with federated credentials for GitHub OIDC, plus (when `manage_github_actions = true`) a GitHub Environment (`staging` / `prod`) with:

| Variable | Purpose |
|---|---|
| `AZURE_CLIENT_ID` | Federated Entra app client ID |
| `AZURE_TENANT_ID` | Directory (tenant) ID |
| `AZURE_SUBSCRIPTION_ID` | Target subscription |
| `AZURE_RESOURCE_GROUP` | Environment resource group |
| `AZURE_STATIC_WEB_APP_NAME` | SWA name for `az staticwebapp secrets list` |

The workflow ([azure-static-web-apps.yml](../.github/workflows/azure-static-web-apps.yml)) uses `azure/login` with OIDC, fetches the SWA deploy key at runtime, and deploys. **Do not** store `AZURE_STATIC_WEB_APPS_API_TOKEN` in GitHub secrets.

Promotion path:

- Pull requests → **Deploy Staging** (GitHub Environment `staging`)
- Push / merge to `main` → **Deploy Staging**, then **Deploy Production** only if staging succeeded (Environment `prod`)

Branch protection should require the **Deploy Staging** status check before merge. Optionally add required reviewers on the `prod` environment for a manual gate after staging.

Verify subjects if login fails (must match GitHub’s assertion, including numeric IDs):

```bash
terraform output github_actions_oidc_subjects
# e.g. repo:jefftindall@10339968/broadway-portfolio@1312787625:environment:staging
```

If Actions reports `AADSTS700213` with a different subject, update `github_owner_id` / `github_repo_id` and re-apply.

Terraform also provisions Application Insights + Log Analytics per environment, sets `APPLICATIONINSIGHTS_CONNECTION_STRING` on the SWA, and publishes GitHub Environment variable `APPINSIGHTS_CONNECTION_STRING` for the browser SDK and deploy telemetry. Optional alerts:

```bash
terraform apply -var="alert_email=you@example.com"
```

See [runbooks/observability.md](runbooks/observability.md).

## 5. Authentication (Entra ID — provisioned by Terraform)

The Entra app registration is **defined in Terraform** ([`infra/modules/portfolio/entra.tf`](../infra/modules/portfolio/entra.tf)), one per environment. Each apply creates:

- `azuread_application` `elyse-portfolio-<env>` (single-tenant, `AzureADMyOrg`)
- A service principal with **user assignment required**
- A client secret stored in Key Vault as `AAD-CLIENT-SECRET`
- SWA app settings `AAD_CLIENT_ID`, `AAD_TENANT_ID`, and a Key Vault reference for the secret

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
| Custom www | `https://www.elysetindall.com/.auth/login/aad/callback` |

Add more via `additional_auth_hostnames` in `terraform.tfvars`.

### Assign Elyse to the app

Because `require_app_role_assignment = true`, she must be assigned before she can sign in:

Azure Portal → **Entra ID → Enterprise applications → `elyse-portfolio-prod` → Users and groups → Add user**.

### Pin the token issuer (recommended)

[`staticwebapp.config.json`](../staticwebapp.config.json) ships with a tenant-agnostic issuer so first deploy works. Harden it by replacing `common` with your tenant:

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

1. Prod Terraform already sets `custom_domain = "elysetindall.com"`
2. Create the TXT validation record from `custom_domain_validation_token` (see [dns-and-domain runbook](runbooks/dns-and-domain.md))
3. After validation, set apex `A`/`ALIAS` or `CNAME` per Azure SWA DNS instructions
4. Optionally add `www` as a second hostname with redirect to apex
5. Verify HTTPS and that WordPress is no longer serving traffic
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
