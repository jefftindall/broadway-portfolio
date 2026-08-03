# Runbook: Rotate secrets

Secrets live in Azure Key Vault as the source of truth. Managed Functions on SWA **do not resolve** `@Microsoft.KeyVault(...)` app settings — they need the resolved values in SWA configuration. Terraform apply and [scripts/sync-swa-api-secrets.sh](../../scripts/sync-swa-api-secrets.sh) copy those values from Key Vault into SWA.

`AAD_CLIENT_SECRET` is the exception: SWA’s auth platform **does** resolve Key Vault references, so that setting stays a reference.

| Environment | Key Vault | Resource group | Static Web App |
|---|---|---|---|
| Staging | `kv-elyse-staging` | `rg-elyse-portfolio-staging` | `swa-elyse-portfolio-staging` |
| Production | `kv-elyse-prod` | `rg-elyse-portfolio-prod` | `swa-elyse-portfolio-prod` |

Subscription: `e601e59a-c7f4-41f0-8178-b59740fb1974`

After updating a vault secret used by the Studio API, sync into SWA (commands below, **Actions → Sync SWA API secrets → Run workflow** and choose `staging` or `prod` — default `staging`, or `terraform apply` for that environment). Values appear in Terraform state and SWA app settings (encrypted at rest by Azure).

## Sync SWA API secrets (no redeploy)

### Staging (copy/paste)

```bash
./scripts/sync-swa-api-secrets.sh staging
```

### Production (copy/paste)

```bash
./scripts/sync-swa-api-secrets.sh prod
```

Requires Azure CLI login with permission to read the vault and update the Static Web App.

## Site contact secrets (build-time)

Email, phone, and date of birth for builds are **not** in git. They live in Key Vault and are injected when Astro / the resume PDF build (CI via [`scripts/fetch-site-contact-secrets.sh`](../../scripts/fetch-site-contact-secrets.sh); locally via `.env`).

| Secret name | Env var | Notes |
|---|---|---|
| `SITE-CONTACT-EMAIL` | `SITE_CONTACT_EMAIL` | Appears on Contact, Footer, JSON-LD after build |
| `SITE-CONTACT-PHONE` | `SITE_CONTACT_PHONE` | Resume PDF + contact API SMS destination (prod) — not shown on the public site (falls back to `src/content/resume-meta.json` if unset for PDF) |
| `SITE-DATE-OF-BIRTH` | `SITE_DATE_OF_BIRTH` | `YYYY-MM-DD`; used only to compute chronological age — never rendered |

Publish the **same** values to **both** vaults:

```bash
# Staging
az keyvault secret set --vault-name kv-elyse-staging --name SITE-CONTACT-EMAIL --value "<email>"
az keyvault secret set --vault-name kv-elyse-staging --name SITE-CONTACT-PHONE --value "<phone>"
az keyvault secret set --vault-name kv-elyse-staging --name SITE-DATE-OF-BIRTH --value "YYYY-MM-DD"

# Production (required — prod builds read kv-elyse-prod)
az keyvault secret set --vault-name kv-elyse-prod --name SITE-CONTACT-EMAIL --value "<email>"
az keyvault secret set --vault-name kv-elyse-prod --name SITE-CONTACT-PHONE --value "<phone>"
az keyvault secret set --vault-name kv-elyse-prod --name SITE-DATE-OF-BIRTH --value "YYYY-MM-DD"
```

Terraform creates the secret shells (`REPLACE_ME`) and grants the GitHub Actions deploy principal Key Vault Secrets User. After updating values, the next staging/prod deploy picks them up — no SWA API secret sync needed for site builds. Contact **email/phone** are also synced into Functions app settings for inquiry notifications (see Contact forms below).

Locally: copy `.env.example` → `.env` and fill the three `SITE_*` vars plus `PUBLIC_TURNSTILE_SITE_KEY` (gitignored).

## Contact forms (ACS email / SMS + Cloudflare Turnstile)

Public forms POST to `/api/contactInquiry`. Email is sent via Azure Communication Services; production also SMS-notifies when a toll-free from-number is configured.

### Turnstile (both keys in Key Vault)

1. Create a free Cloudflare account → **Turnstile → Add widget**.
2. Hostnames: `elysetindall.com`, `www.elysetindall.com`, staging SWA host, `localhost`.
3. Set both vaults (same widget is fine):

```bash
az keyvault secret set --vault-name kv-elyse-staging --name TURNSTILE-SITE-KEY --value "<site-key>"
az keyvault secret set --vault-name kv-elyse-staging --name TURNSTILE-SECRET-KEY --value "<secret-key>"
az keyvault secret set --vault-name kv-elyse-prod --name TURNSTILE-SITE-KEY --value "<site-key>"
az keyvault secret set --vault-name kv-elyse-prod --name TURNSTILE-SECRET-KEY --value "<secret-key>"
```

4. Sync SWA API secrets (secret key → Functions). Redeploy site so CI fetch picks up the site key (`PUBLIC_TURNSTILE_SITE_KEY`).

No AWS account and no Cloudflare DNS hosting required.

### ACS email (Terraform-managed)

Terraform provisions ACS + Azure-managed sending domain and writes `ACS-CONNECTION-STRING` / `ACS-EMAIL-SENDER` to Key Vault and SWA. Notify-to email comes from `SITE-CONTACT-EMAIL`.

After first apply, sync SWA secrets if app settings were not updated by apply alone.

### Prod SMS (manual toll-free)

Staging is email-only (`CONTACT_SMS_ENABLED=false`). Prod enables SMS when `ACS-SMS-FROM` is set:

1. Azure Portal → Communication Service (`acs-elyse-portfolio-prod`) → **Telephony and SMS → Phone numbers → Get** → US toll-free with SMS.
2. Complete US/CA toll-free SMS verification (Regulatory Documents).
3. Store the E.164 number:

```bash
az keyvault secret set --vault-name kv-elyse-prod --name ACS-SMS-FROM --value "+1XXXXXXXXXX"
./scripts/sync-swa-api-secrets.sh prod
```

Notify-to phone is `SITE-CONTACT-PHONE` (same as resume PDF). Leave `ACS-SMS-FROM` as `REPLACE_ME` until the number is verified — the API then skips SMS and still sends email.

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
