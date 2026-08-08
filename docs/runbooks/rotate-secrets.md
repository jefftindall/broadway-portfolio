# Runbook: Rotate secrets

Secrets live in Azure Key Vault as the source of truth. Managed Functions on SWA **do not resolve** `@Microsoft.KeyVault(...)` app settings — they need the resolved values in SWA configuration. Terraform apply and [scripts/sync-swa-api-secrets.sh](../../scripts/sync-swa-api-secrets.sh) copy those values from Key Vault into SWA.

`AAD_CLIENT_SECRET` is the exception: SWA’s auth platform **does** resolve Key Vault references, so that setting stays a reference.

| Scope | Key Vault | Resource group | Purpose |
|---|---|---|---|
| **Shared (build + ACS + ops alerts)** | `kv-elyse-shared` | `rg-elyse-shared` | SITE-*, Turnstile, ACS email/SMS, `ALERT-*` (identical across envs) |
| Staging API | `kv-elyse-staging` | `rg-elyse-portfolio-staging` | Gemini, GitHub App, allowlist, AAD |
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
| `SITE-CONTACT-PHONE` | `SITE_CONTACT_PHONE` | Resume PDF + SMS notify-to (not shown on site) |
| `SITE-DATE-OF-BIRTH` | `SITE_DATE_OF_BIRTH` | `YYYY-MM-DD`; age only |
| `TURNSTILE-SITE-KEY` | `PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare widget site key (public) |
| `TURNSTILE-SECRET-KEY` | `TURNSTILE_SECRET` | Synced into Functions (both envs) |
| `ACS-CONNECTION-STRING` | `ACS_CONNECTION_STRING` | Terraform-managed from `acs-elyse-shared` |
| `ACS-EMAIL-SENDER` | `ACS_EMAIL_SENDER` | Terraform-managed Azure-managed MailFrom |
| `ACS-SMS-FROM` | `ACS_SMS_FROM` | Manual E.164; leave `REPLACE_ME` until toll-free is verified |

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

Repo Actions variable `AZURE_SHARED_KEY_VAULT_NAME` is set by bootstrap. Static analysis job **Shared vault secrets** (pull requests only) emits warnings when any of these are missing / `REPLACE_ME` (does not fail the check).

Locally: copy `.env.example` → `.env` and fill `SITE_*` plus `PUBLIC_TURNSTILE_SITE_KEY`. Optional: `PUBLIC_GA_MEASUREMENT_ID` (defaults to `G-XEE29C0RRE` in code and Terraform when unset).

## Google Analytics 4 (public Measurement ID)

Not a Key Vault secret — the ID is public-by-design and embedded in the client bundle.

| Source | Name | Notes |
|---|---|---|
| Terraform `ga_measurement_id` | GitHub Environment `GA_MEASUREMENT_ID` | Default `G-XEE29C0RRE`; applied per staging/prod |
| Astro build | `PUBLIC_GA_MEASUREMENT_ID` | Workflows map from `vars.GA_MEASUREMENT_ID`; code falls back to the same default |

To rotate the Measurement ID: `terraform apply -var='ga_measurement_id=G-…'` in each environment, then redeploy so the Astro bundle picks up the new value.

## Contact forms (ACS email / SMS + Cloudflare Turnstile)

Public forms POST to `/api/contactInquiry`. Email (and SMS when configured) go through the **shared** Communication Service `acs-elyse-shared` in `rg-elyse-shared`.

### Turnstile

1. Create a free Cloudflare account → **Turnstile → Add widget**.
2. Hostnames: `elysetindall.com`, `www.elysetindall.com`, staging SWA host, `localhost`.
3. Set **shared** vault only (commands above).
4. Sync SWA API secrets (secret key → Functions). Redeploy so Build release picks up the site key.

No AWS account and no Cloudflare DNS hosting required.

### ACS email (bootstrap Terraform)

Bootstrap provisions ACS + Azure-managed sending domain and writes `ACS-CONNECTION-STRING` / `ACS-EMAIL-SENDER` into `kv-elyse-shared`. Staging and prod SWA both use those values. Notify-to email/phone come from shared `SITE-CONTACT-*`.

After bootstrap (or MailFrom change), sync both environments if apply did not already update app settings.

### Shared SMS (manual toll-free)

Both staging and prod set `CONTACT_SMS_ENABLED=true`. The API sends SMS only when `ACS-SMS-FROM` is a real E.164 number (not `REPLACE_ME`).

```bash
az keyvault secret set --vault-name kv-elyse-shared --name ACS-SMS-FROM --value "+1XXXXXXXXXX"
./scripts/sync-swa-api-secrets.sh staging
./scripts/sync-swa-api-secrets.sh prod
```

Portal: Communication Service **`acs-elyse-shared`** → purchase toll-free + [toll-free verification](https://learn.microsoft.com/azure/communication-services/quickstarts/sms/apply-for-toll-free-verification). Leave `ACS-SMS-FROM` as `REPLACE_ME` until verified — email still works.

For the verification program brief, use the public SMS policy URL:

`https://elysetindall.com/privacy#sms`

(also linked from the site footer and inquiry forms). Opt-out: reply **STOP**; help: reply **HELP**.

## Ops alert contacts (`ALERT-*`, shared vault)

**Separate from contact-form notify.** `SITE-CONTACT-*` / ACS SMS deliver inquiry notifications. On-call / Sev1–Sev3 Azure Monitor Action Groups use dedicated **`ALERT-*`** secrets in **`kv-elyse-shared`** (same operator for staging + prod). Never commit real emails or phones — placeholders only in git.

Created by **bootstrap** Terraform (`infra/bootstrap/shared_kv.tf`, `OPS-P0-002`). Env stacks read them at apply (`OPS-P1-*` done): `ag-elyse-notify-*` (email ± SMS) and `ag-elyse-critical-*` (email + SMS + voice). Leave values as `REPLACE_ME` until you are ready to receive pages — Terraform skips that receiver (and skips the Action Group entirely if every contact is still a placeholder).

| Secret name | Vault | Format | Used by |
|---|---|---|---|
| `ALERT-EMAIL` | `kv-elyse-shared` | Email address | Notify + critical + watch Action Groups |
| `ALERT-SMS-PHONE` | `kv-elyse-shared` | E.164 (`+1XXXXXXXXXX`) | SMS on notify + critical |
| `ALERT-VOICE-PHONE` | `kv-elyse-shared` | E.164 (optional; may match SMS) | Voice on critical only |

```bash
# After bootstrap apply (secrets exist as REPLACE_ME):
az keyvault secret set --vault-name kv-elyse-shared --name ALERT-EMAIL --value "<email>"
az keyvault secret set --vault-name kv-elyse-shared --name ALERT-SMS-PHONE --value "+1XXXXXXXXXX"
az keyvault secret set --vault-name kv-elyse-shared --name ALERT-VOICE-PHONE --value "+1XXXXXXXXXX"
```

These secrets are **not** synced into SWA app settings and are **not** required for CD Build (unlike SITE-*/Turnstile). Monitor reads them at `terraform apply` via data sources in `infra/modules/portfolio/shared_kv.tf`. After setting values, re-apply staging and/or prod so Action Groups pick them up.

**Prove Sev1 (OPS-P1-003):** After prod apply with real `ALERT-*` values, in Azure Portal open `ag-elyse-critical-prod` → **Test action group** (email + SMS + voice). Optionally lower the homepage/materials availability alert threshold briefly, confirm a page, then restore. Confirm receipt on-device; **do not** record the email/phone or screenshots with PII in git, PRs, or the scorecard — note only “receipt confirmed YYYY-MM-DD” in the plan/scorecard evidence. Sev3 FCP watch uses `ag-elyse-watch-prod` (email only).

Do **not** reuse `SITE-CONTACT-EMAIL`, `SITE-CONTACT-PHONE`, or `ACS-SMS-FROM` for ops paging.

## Key Vault purge protection (`OPS-P3-006`)

**Decision (accepted):** Enable purge protection on shared + prod vaults. Soft-delete retention stays **7 days** (Azure does not allow changing `soft_delete_retention_days` after the vault is created).

| Vault | Scope |
|-------|--------|
| `kv-elyse-shared` | Bootstrap (`infra/bootstrap/shared_kv.tf`) — SITE-*, Turnstile, ACS, `ALERT-*` |
| `kv-elyse-prod` | Prod env module (`purge_protection_enabled = true`) |

Staging env vault stays **without** purge protection so tear-down / experiment remains possible.

Purge protection is **one-way** while soft-delete retention remains: you cannot purge a deleted vault/secret until the retention window elapses, and you cannot turn protection off without waiting out retention after disabling (Azure blocks disable while protection is on). Apply bootstrap then prod Terraform after merge; document only the decision here — never secret values.

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

**Rotate immediately** if the PEM appears in GitHub Actions logs (or any other log/chat/PR). Treat a leaked key as compromised even if the run failed afterward.

1. GitHub App settings → **Private keys → Generate a private key**
2. Upload to both Key Vaults:

```bash
az keyvault secret set --vault-name kv-elyse-staging --name GITHUB-APP-PRIVATE-KEY --file ./new-key.pem
az keyvault secret set --vault-name kv-elyse-prod --name GITHUB-APP-PRIVATE-KEY --file ./new-key.pem
```

3. Sync both environments (script above or Sync SWA API secrets workflow)
4. Delete the previous private key in the GitHub App UI (revokes the leaked material)
5. Delete the local `.pem`
6. Verify Studio can still commit; re-run **OPS monthly scorecard** if that job needs the App

App ID and installation ID rarely change; only update those Key Vault secrets if you recreate the App or reinstall it, then sync.

Workflows that mint App tokens must **mask** the PEM (`::add-mask::` on the full value and each line) and must **not** pass it through an action `with:` input (those inputs are printed to the job log). Prefer in-shell JWT + installation-token minting (see `.github/workflows/ops-scorecard-monthly.yml`).

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
