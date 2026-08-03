# Runbook: Rotate secrets

Secrets live in Azure Key Vault as the source of truth. Managed Functions on SWA **do not resolve** `@Microsoft.KeyVault(...)` app settings — they need the resolved values in SWA configuration. Terraform apply and [scripts/sync-swa-api-secrets.sh](../../scripts/sync-swa-api-secrets.sh) copy those values from Key Vault into SWA.

`AAD_CLIENT_SECRET` is the exception: SWA’s auth platform **does** resolve Key Vault references, so that setting stays a reference.

| Scope | Key Vault | Resource group | Purpose |
|---|---|---|---|
| **Shared (build)** | `kv-elyse-shared` | `rg-elyse-shared` | SITE-* + Turnstile (identical across envs; single release build) |
| Staging API | `kv-elyse-staging` | `rg-elyse-portfolio-staging` | Gemini, GitHub App, ACS, allowlist, SMS-from |
| Production API | `kv-elyse-prod` | `rg-elyse-portfolio-prod` | Same as staging |

Subscription: `e601e59a-c7f4-41f0-8178-b59740fb1974`

After updating a vault secret used by the Studio / contact **API**, sync into SWA (commands below, **Actions → Sync SWA API secrets → Run workflow**, or `terraform apply`). Site-build secrets are read from **`kv-elyse-shared`** during the single Build release job.

## Sync SWA API secrets (no redeploy)

### Staging (copy/paste)

```bash
./scripts/sync-swa-api-secrets.sh staging
```

### Production (copy/paste)

```bash
./scripts/sync-swa-api-secrets.sh prod
```

Requires Azure CLI login with permission to read both the env vault and `kv-elyse-shared`, and update the Static Web App.

## Shared site-build secrets (`kv-elyse-shared`)

Created by **bootstrap** Terraform (`infra/bootstrap/shared_kv.tf`). One Astro build embeds these for both staging and prod deploys — they must stay identical.

| Secret name | Env var | Notes |
|---|---|---|
| `SITE-CONTACT-EMAIL` | `SITE_CONTACT_EMAIL` | Public contact email / ACS notify-to |
| `SITE-CONTACT-PHONE` | `SITE_CONTACT_PHONE` | Resume PDF + prod SMS notify-to (not shown on site) |
| `SITE-DATE-OF-BIRTH` | `SITE_DATE_OF_BIRTH` | `YYYY-MM-DD`; age only |
| `TURNSTILE-SITE-KEY` | `PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare widget site key (public) |
| `TURNSTILE-SECRET-KEY` | `TURNSTILE_SECRET_KEY` | Synced into Functions (both envs) |

```bash
# Apply bootstrap once so kv-elyse-shared exists, then:
az keyvault secret set --vault-name kv-elyse-shared --name SITE-CONTACT-EMAIL --value "<email>"
az keyvault secret set --vault-name kv-elyse-shared --name SITE-CONTACT-PHONE --value "<phone>"
az keyvault secret set --vault-name kv-elyse-shared --name SITE-DATE-OF-BIRTH --value "YYYY-MM-DD"
az keyvault secret set --vault-name kv-elyse-shared --name TURNSTILE-SITE-KEY --value "<site-key>"
az keyvault secret set --vault-name kv-elyse-shared --name TURNSTILE-SECRET-KEY --value "<secret-key>"

# If values already lived in env vaults, copy once then stop writing there:
# az keyvault secret show --vault-name kv-elyse-staging --name SITE-CONTACT-EMAIL --query value -o tsv
```

Repo Actions variable `AZURE_SHARED_KEY_VAULT_NAME` is set by bootstrap. Static analysis job **Shared vault secrets** emits warnings when any of these are missing / `REPLACE_ME` (does not fail the check).

Locally: copy `.env.example` → `.env` and fill `SITE_*` plus `PUBLIC_TURNSTILE_SITE_KEY`.

## Contact forms (ACS email / SMS + Cloudflare Turnstile)

Public forms POST to `/api/contactInquiry`. Email is sent via Azure Communication Services; production also SMS-notifies when a toll-free from-number is configured.

### Turnstile

1. Create a free Cloudflare account → **Turnstile → Add widget**.
2. Hostnames: `elysetindall.com`, `www.elysetindall.com`, staging SWA host, `localhost`.
3. Set **shared** vault only (commands above).
4. Sync SWA API secrets (secret key → Functions). Redeploy so Build release picks up the site key.

No AWS account and no Cloudflare DNS hosting required.

### ACS email (Terraform-managed, per env)

Terraform provisions ACS + Azure-managed sending domain into each env vault / SWA. Notify-to email/phone come from **shared** `SITE-CONTACT-*`.

After first apply, sync SWA secrets if app settings were not updated by apply alone.

### Prod SMS (manual toll-free)

Staging is email-only (`CONTACT_SMS_ENABLED=false`). Prod enables SMS when `ACS-SMS-FROM` is set **in the prod env vault**:

```bash
az keyvault secret set --vault-name kv-elyse-prod --name ACS-SMS-FROM --value "+1XXXXXXXXXX"
./scripts/sync-swa-api-secrets.sh prod
```

Portal: Communication Service `acs-elyse-portfolio-prod` → toll-free SMS + verification. Leave `ACS-SMS-FROM` as `REPLACE_ME` until verified — the API skips SMS and still sends email.

## Rotate Gemini API key

1. Create a new key in Google AI Studio
2. Update both vaults:

```bash
az keyvault secret set --vault-name kv-elyse-staging --name GEMINI-API-KEY --value "<new>"
az keyvault secret set --vault-name kv-elyse-prod --name GEMINI-API-KEY --value "<new>"
```

3. Sync both environments (script above or Sync SWA API secrets workflow)
4. Revoke the old Gemini key
5. Publish a harmless Studio update to verify

## Rotate the GitHub App private key

1. GitHub App settings → **Private keys → Generate a private key**
2. Upload to both Key Vaults:

```bash
az keyvault secret set --vault-name kv-elyse-staging --name GITHUB-APP-PRIVATE-KEY --file ./new-key.pem
az keyvault secret set --vault-name kv-elyse-prod --name GITHUB-APP-PRIVATE-KEY --file ./new-key.pem
```

3. Sync both environments (script above or Sync SWA API secrets workflow)
4. Delete the previous private key in the GitHub App UI
5. Delete the local `.pem`
6. Verify Studio can still commit

App ID and installation ID rarely change; only update those Key Vault secrets if you recreate the App or reinstall it, then sync.

## Rotate the Entra client secret (Studio login)

The secret is created by Terraform (`azuread_application_password`) and written to Key Vault as `AAD-CLIENT-SECRET`.

Rotation is automatic: a `time_rotating` resource triggers a replacement secret every `entra_secret_rotation_days` (default 300), while each secret stays valid for `entra_secret_lifetime` (default one year). Because rotation happens before expiry, a routine `terraform apply` picks up the new secret with no outage.

To force rotation early:

```bash
cd infra/environments/<env>
terraform apply -replace='module.portfolio.azuread_application_password.swa'
```

Either path issues a new secret, updates Key Vault, and leaves the SWA app setting reference intact. Confirm sign-in at `/studio` afterward.

## GitHub Actions deploy credentials

There is **no long-lived SWA deploy token** in GitHub secrets. Actions use OIDC (`azure/login`) and fetch the SWA API key at job runtime via `az staticwebapp secrets list`.

To rotate Entra trust for Actions, re-apply Terraform (federated credentials are declarative). Resetting the SWA deployment token in the Azure Portal is optional; the next workflow run picks up the current key automatically.

## Rules

- Never put secrets in git, Terraform `tfvars`, or chat logs
- Prefer GitHub App private keys and OIDC over PATs
- Delete downloaded `.pem` files after uploading to Key Vault
- After changing API secrets in Key Vault, always sync to SWA (script, workflow, or terraform apply)
