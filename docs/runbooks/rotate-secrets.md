# Runbook: Rotate secrets

Secrets live in Azure Key Vault as the source of truth. Managed Functions on SWA **do not resolve** `@Microsoft.KeyVault(...)` app settings — they need the resolved values in SWA configuration. Terraform apply and [scripts/sync-swa-api-secrets.sh](../../scripts/sync-swa-api-secrets.sh) copy those values from Key Vault into SWA.

`AAD_CLIENT_SECRET` is the exception: SWA’s auth platform **does** resolve Key Vault references, so that setting stays a reference.

| Scope | Key Vault | Resource group | Purpose |
|---|---|---|---|
| **Shared (build + ACS + ops alerts + GA/GSC scorecard + Studio monitor + Stripe API keys)** | `kv-elyse-shared` | `rg-elyse-shared` | SITE-*, Turnstile, ACS email/SMS, `ALERT-*`, `GA-*`, `GSC-*`, `MONITOR-*`, `STRIPE-TEST-SECRET-KEY` / `STRIPE-TEST-PUBLISHABLE-KEY` / `STRIPE-LIVE-SECRET-KEY` / `STRIPE-LIVE-PUBLISHABLE-KEY` |
| Staging API | `kv-elyse-staging` | `rg-elyse-portfolio-staging` | Gemini, GitHub App, allowlist, AAD, Stripe webhook / Payment Links, Google Calendar OAuth |
| Production API | `kv-elyse-prod` | `rg-elyse-portfolio-prod` | Same as staging |

Subscription: `e601e59a-c7f4-41f0-8178-b59740fb1974`

After updating a vault secret used by the Studio / contact **API**, sync into SWA (commands below, **Actions → Ops: sync SWA secrets → Run workflow**, or `terraform apply`). Site-build secrets are read from **`kv-elyse-shared`** during the single Build release job.

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
| `ACS-SMS-FROM` | `ACS_SMS_FROM` | Manual E.164 toll-free; may be set in KV while verification is pending (~5 weeks). SMS sends only once ACS accepts the number |
| `STRIPE-TEST-SECRET-KEY` / `STRIPE-LIVE-SECRET-KEY` | `STRIPE_SECRET_KEY` | Lesson payments API keys — see [Stripe](#stripe-lesson-payments). Not baked into the Astro bundle |
| `MONITOR-UPN` | `MONITOR_UPN` | Terraform-managed Studio smoke user; [studio-auth-monitoring.md](studio-auth-monitoring.md) |
| `MONITOR-PASSWORD` | `MONITOR_PASSWORD` | Terraform-managed (`random_password`); also in bootstrap state |
| `MONITOR-TOTP-SEED` | `MONITOR_TOTP_SEED` | Operator-set Base32 seed (`REPLACE_ME` until enrolled). **Never** Terraform |

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

`MONITOR-UPN` / `MONITOR-PASSWORD` are set by bootstrap Terraform (`infra/bootstrap/monitor_user.tf`). Set `MONITOR-TOTP-SEED` from a file after software TOTP enrollment — never `--value` with the seed on the command line. Full capture, rotation, and diagnostics: [studio-auth-monitoring.md](studio-auth-monitoring.md).

Repo Actions variable `AZURE_SHARED_KEY_VAULT_NAME` is set by bootstrap. **CI: static analysis** job **Shared vault secrets** (pull requests only) emits warnings when any of these are missing / `REPLACE_ME` (does not fail the check).

Locally: copy `.env.example` → `.env` and fill `SITE_*` plus `PUBLIC_TURNSTILE_SITE_KEY`. Optional: `PUBLIC_GA_MEASUREMENT_ID` (defaults to `G-XEE29C0RRE` in code and Terraform when unset). Local pay CTAs (without Functions) use `PUBLIC_LESSON_PAYMENTS_ENABLED` plus `PUBLIC_STRIPE_PAYMENT_LINK_*` test-mode URLs — CD does **not** bake those; staging/prod read the flag and links from SWA app settings.

## Google Analytics 4 (public Measurement ID)

Not a Key Vault secret — the ID is public-by-design and embedded in the client bundle.

| Source | Name | Notes |
|---|---|---|
| Terraform `ga_measurement_id` | GitHub Environment `GA_MEASUREMENT_ID` | Default `G-XEE29C0RRE`; applied per staging/prod |
| Astro build | `PUBLIC_GA_MEASUREMENT_ID` | Workflows map from `vars.GA_MEASUREMENT_ID`; code falls back to the same default |

To rotate the Measurement ID: `terraform apply -var='ga_measurement_id=G-…'` in each environment, then redeploy so the Astro bundle picks up the new value.

### GA Data API (scorecard reads) — `OPS-P5-002`

Browser collection does **not** need this. Automating **visits / top pages** into the monthly scorecard does. Bootstrap Terraform creates placeholders in `kv-elyse-shared`; set real values via CLI only.

| Secret | Purpose |
|--------|---------|
| `GA-PROPERTY-ID` | Numeric GA4 property ID (`properties/{id}` — not `G-…`) |
| `GA-DATA-API-SA-JSON` | Google Cloud service-account JSON key with **Viewer** on the GA4 property |

```bash
# After bootstrap apply — full GCP + GA Viewer checklist:
#   docs/runbooks/ga-data-api-access.md
az keyvault secret set --vault-name kv-elyse-shared --name GA-PROPERTY-ID --value "<numeric-property-id>"
az keyvault secret set --vault-name kv-elyse-shared --name GA-DATA-API-SA-JSON --file ./ga-scorecard-sa.json
rm -f ./ga-scorecard-sa.json
```

Never echo the JSON key; mask line-by-line in Actions; rotate the GCP key immediately if leaked. These secrets are **not** synced into SWA. Full operator checklist + rotate: [ga-data-api-access.md](ga-data-api-access.md).

### GSC Search Analytics API (monthly search signals) — `SEARCH-P4-001`

Automating GSC queries / CTR / page impressions for `SEARCH-P4-002` needs a Search Console property user (service account) plus the site URL string. Prefer **reusing** the GA scorecard SA after enabling `searchconsole.googleapis.com` and granting the SA on the GSC property.

| Secret | Purpose |
|--------|---------|
| `GSC-SITE-URL` | Live default: `https://elysetindall.com/` (URL-prefix). KV optional — fetch/refresh fall back to this when missing/`REPLACE_ME` |
| `GSC-DATA-API-SA-JSON` | Optional dedicated SA JSON; leave `REPLACE_ME` to fall back to `GA-DATA-API-SA-JSON` |

```bash
# After bootstrap apply — full checklist:
#   docs/runbooks/gsc-data-api-access.md
az keyvault secret set --vault-name kv-elyse-shared --name GSC-SITE-URL --value "https://elysetindall.com/"
# Only if not reusing GA-DATA-API-SA-JSON:
# az keyvault secret set --vault-name kv-elyse-shared --name GSC-DATA-API-SA-JSON --file ./gsc-search-sa.json
# rm -f ./gsc-search-sa.json
```

Never echo the JSON key. These secrets are **not** synced into SWA. Workflow: `.github/workflows/search-ops-monthly.yml`.

## Stripe (lesson payments)

API keys live in **shared** `kv-elyse-shared`. Staging initializes the Stripe provider with **test** keys; prod uses **live** keys. Each environment stack owns its catalog (products, prices from [`src/content/pages/lessons-book.md`](../../src/content/pages/lessons-book.md), webhook endpoint, Payment Link upsert) so staging validates before prod promote. Webhook signing secrets and Payment Link URLs are stored in the **env vault** (`kv-elyse-staging` / `kv-elyse-prod`) because deploy identities can read shared KV but cannot write catalog outputs back there. Environment stacks must not feed bootstrap. CD deploys one Astro artifact to both SWAs, so Payment Links and the public pay-flow flag are **runtime** Function/SWA settings (`GET /api/lessonPayConfig`), not build-time `PUBLIC_*` vars.

Prefer a **restricted API key** (`rk_test_` / `rk_live_`) with Products, Prices, Webhook Endpoints, and Payment Links write. Never put secret/restricted keys in the Astro bundle, git, or chat.

| Secret name | Env var | Where | Staging (test) | Production (live) |
|---|---|---|---|---|
| `STRIPE-TEST-SECRET-KEY` / `STRIPE-LIVE-SECRET-KEY` | `STRIPE_SECRET_KEY` | `kv-elyse-shared` | `rk_test_…` or `sk_test_…` | `rk_live_…` or `sk_live_…` |
| `STRIPE-TEST-PUBLISHABLE-KEY` / `STRIPE-LIVE-PUBLISHABLE-KEY` | `STRIPE_PUBLISHABLE_KEY` | `kv-elyse-shared` | `pk_test_…` | `pk_live_…` |
| `STRIPE-WEBHOOK-SECRET` | `STRIPE_WEBHOOK_SECRET` | env vault | Written by staging Terraform from `stripe_webhook_endpoint` | Same (prod / live endpoint) |
| `STRIPE-PAYMENT-LINK-30MIN` | `STRIPE_PAYMENT_LINK_30MIN` | env vault | Upserted by staging apply from the 30-min price | Same (live) |
| `STRIPE-PAYMENT-LINK-60MIN` | `STRIPE_PAYMENT_LINK_60MIN` | env vault | Upserted from the 60-min price | Same (live) |

Feature flag (not a Key Vault secret): SWA app setting `LESSON_PAYMENTS_ENABLED`, Terraform `lesson_payments_enabled` — **true on staging**, **false on prod** until go-live. `GET /api/lessonPayConfig` returns links only when the flag is on **and** at least one Payment Link is a real `https://buy.stripe.com/…` URL (not `REPLACE_ME`). Prod with the flag off does not expose live links.

## Contact accounts (External ID)

Student/parent sign-in uses a **separate Entra External ID (CIAM) tenant** — not the workforce teaching tenant. Terraform creates the tenant (bootstrap), OIDC apps (env stacks), and most secrets. Social IdPs stay manual. Calendar Google OAuth clients are unrelated.

| Secret name | SWA app setting / use | Where | Managed by |
|-------------|----------------------|-------|------------|
| `CONTACT-CIAM-TENANT-ID` | CIAM tenant GUID (env `azuread.contact_ciam`) | `kv-elyse-shared` | bootstrap Terraform |
| `CONTACT-CIAM-DOMAIN-PREFIX` | CIAM domain prefix (`{prefix}.ciamlogin.com`) | `kv-elyse-shared` | bootstrap Terraform |
| `CONTACT-CIAM-OIDC-ISSUER` | CD patches `dist/staticwebapp.config.json` issuer | `kv-elyse-shared` | bootstrap Terraform; CD reads via `scripts/sync-contact-oidc-issuer.mjs` |
| `CONTACT-CIAM-TF-CLIENT-ID` | GitHub Actions Terraform `azuread.contact_ciam` OIDC client | `kv-elyse-shared` | bootstrap Terraform (`elyse-portfolio-gha-ciam-terraform`) |
| `CONTACT-OIDC-CLIENT-ID` | `CONTACT_OIDC_CLIENT_ID` | env vault | env Terraform (`elyse-portfolio-contact-{env}` app) |
| `CONTACT-OIDC-CLIENT-SECRET` | `CONTACT_OIDC_CLIENT_SECRET` | env vault (SWA Key Vault reference) | env Terraform (rotates with `entra_secret_rotation_days`) |

Feature flag (not a Key Vault secret): SWA app setting `CONTACT_ACCOUNTS_ENABLED`, Terraform `contact_accounts_enabled` — **true on staging**, **false on prod** until go-live. `GET /api/contactAccountConfig` returns `{ enabled: boolean }` only. Independent of `LESSON_PAYMENTS_ENABLED`. Prod go-live: `terraform apply -var='contact_accounts_enabled=true'`.

Setup (in order): [contact-accounts-ciam-terraform.md](./contact-accounts-ciam-terraform.md) → [contact-accounts-social-idps.md](./contact-accounts-social-idps.md). Index: [contact-accounts-auth.md](./contact-accounts-auth.md).

Committed `staticwebapp.config.json` keeps a **REPLACE_ME** issuer placeholder; CD injects the live issuer from `CONTACT-CIAM-OIDC-ISSUER` before SWA upload. Local optional sync: `node scripts/sync-contact-oidc-issuer.mjs repo`.

When advertised rates in `lessons-book.md` change, **re-apply the environment stack** (staging first, then prod) so Stripe prices and Payment Links follow the website (Stripe prices are immutable; Terraform replaces them).

```bash
# After bootstrap apply (API-key placeholders exist). Strip trailing newlines
# (tr -d '\r\n') so Stripe Authorization headers stay valid. Never --value a
# secret key if shell history is retained:
az keyvault secret set --vault-name kv-elyse-shared --name STRIPE-TEST-SECRET-KEY --file ./stripe-rk-test.txt
az keyvault secret set --vault-name kv-elyse-shared --name STRIPE-TEST-PUBLISHABLE-KEY --value "pk_test_..."
az keyvault secret set --vault-name kv-elyse-shared --name STRIPE-LIVE-SECRET-KEY --file ./stripe-rk-live.txt
az keyvault secret set --vault-name kv-elyse-shared --name STRIPE-LIVE-PUBLISHABLE-KEY --value "pk_live_..."
rm -f ./stripe-rk-test.txt ./stripe-rk-live.txt

# Environment apply creates products, prices, webhooks, and Payment Links (test on staging, live on prod).
cd infra/environments/staging && terraform apply
cd infra/environments/prod && terraform apply
./scripts/sync-swa-api-secrets.sh staging
./scripts/sync-swa-api-secrets.sh prod
```

Do not write webhook secrets by hand — each env stack stores `stripe_webhook_endpoint.secret` in that vault’s `STRIPE-WEBHOOK-SECRET`. Restricted keys need Products / Prices / Webhook Endpoints / Payment Links write. Env apply destroys leftover `STRIPE-SECRET-KEY` / `STRIPE-PUBLISHABLE-KEY` in `kv-elyse-staging` / `kv-elyse-prod` if those names still exist. The pay-flow **flag** is not in Key Vault; after links are populated, staging shows `/lessons/book` Pay CTAs automatically. To show them on production: `cd infra/environments/prod && terraform apply -var='lesson_payments_enabled=true'`.

If a live key is leaked, roll it in the Stripe Dashboard immediately (see [protecting against compromised API keys](https://support.stripe.com/questions/protecting-against-compromised-api-keys)) and update the matching shared vault secret + re-apply **prod** + sync.

## Contact forms (ACS email / SMS + Cloudflare Turnstile)

Public forms POST to `/api/contactInquiry`. Email (and SMS when configured) go through the **shared** Communication Service `acs-elyse-shared` in `rg-elyse-shared`.

### Turnstile

1. Create a free Cloudflare account → **Turnstile → Add widget**.
2. Hostnames: `elysetindall.com`, `www.elysetindall.com`, `test.elysetindall.com`, staging SWA host (`*.azurestaticapps.net`), `localhost`.
3. Set **shared** vault only (commands above).
4. Sync SWA API secrets (secret key → Functions). Redeploy so Build release picks up the site key.

No AWS account and no Cloudflare DNS hosting required.

### ACS email (bootstrap Terraform)

Bootstrap provisions ACS + Azure-managed sending domain and writes `ACS-CONNECTION-STRING` / `ACS-EMAIL-SENDER` into `kv-elyse-shared`. Staging and prod SWA both use those values. Notify-to email/phone come from shared `SITE-CONTACT-*`.

After bootstrap (or MailFrom change), sync both environments if apply did not already update app settings.

### Shared SMS (manual toll-free)

Both staging and prod set `CONTACT_SMS_ENABLED=true`. The API sends SMS only when `ACS-SMS-FROM` is a real E.164 number (not `REPLACE_ME`) **and** ACS has accepted the number for SMS (after toll-free verification).

```bash
az keyvault secret set --vault-name kv-elyse-shared --name ACS-SMS-FROM --value "+1XXXXXXXXXX"
./scripts/sync-swa-api-secrets.sh staging
./scripts/sync-swa-api-secrets.sh prod
```

Portal: Communication Service **`acs-elyse-shared`** → purchase toll-free + [toll-free verification](https://learn.microsoft.com/azure/communication-services/quickstarts/sms/apply-for-toll-free-verification). **Lease cost is ~$2/mo from purchase** (see [cost-and-quotas.md](cost-and-quotas.md)). Verification often takes **~5 weeks**; storing the E.164 in Key Vault during that wait is expected. Until SMS works end-to-end, inquiry **email** still delivers. You may keep `REPLACE_ME` instead if you prefer not to sync the number until verified.

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
| `kv-elyse-shared` | Bootstrap (`infra/bootstrap/shared_kv.tf`) — SITE-*, Turnstile, ACS, `ALERT-*`, `GA-*`, Stripe API keys |
| `kv-elyse-prod` | Prod env module (`purge_protection_enabled = true`) |

Staging env vault stays **without** purge protection so tear-down / experiment remains possible.

Purge protection is **one-way** while soft-delete retention remains: you cannot purge a deleted vault/secret until the retention window elapses, and you cannot turn protection off without waiting out retention after disabling (Azure blocks disable while protection is on). Apply bootstrap then prod Terraform after merge; document only the decision here — never secret values.

## Google Calendar OAuth (`STUDIO-P3`)

Env vaults (`kv-elyse-staging` / `kv-elyse-prod`). Client id/secret are required before **Connect Google** works. Refresh-token secrets are optional operator fallbacks — Studio Connect writes tokens to Table Storage (`studioCalendar`) at runtime.

| Secret | SWA app setting | Notes |
|--------|-----------------|-------|
| `GOOGLE-CALENDAR-CLIENT-ID` | `GOOGLE_CALENDAR_CLIENT_ID` | OAuth Web client id |
| `GOOGLE-CALENDAR-CLIENT-SECRET` | `GOOGLE_CALENDAR_CLIENT_SECRET` | Also signs OAuth `state` and ICS Confirm/Decline links |
| `GOOGLE-CALENDAR-ORGANIZER-REFRESH-TOKEN` | `GOOGLE_CALENDAR_ORGANIZER_REFRESH_TOKEN` | Placeholder / bootstrap; Connect in Studio is preferred |
| `GOOGLE-CALENDAR-ELYSE-REFRESH-TOKEN` | `GOOGLE_CALENDAR_ELYSE_REFRESH_TOKEN` | Same for Elyse free/busy |

Redirect URIs and test users: [studio-calendar.md](./studio-calendar.md). After changing client id/secret, sync SWA. After a suspected leak, create a new OAuth client, set the new secrets, sync, then **Disconnect** and **Connect** both roles in Studio so Table rows are replaced. Never print token values.

ICS fallback uses existing `SITE-CONTACT-EMAIL` → `CONTACT_NOTIFY_EMAIL` — not `ALERT-*`.

## Rotate Gemini API key

1. Create a new key in Google AI Studio
2. Update both vaults:

```bash
az keyvault secret set --vault-name kv-elyse-staging --name GEMINI-API-KEY --value "<new>"
az keyvault secret set --vault-name kv-elyse-prod --name GEMINI-API-KEY --value "<new>"
```

3. Sync both environments (script above or **Ops: sync SWA secrets** workflow)
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

3. Sync both environments (script above or **Ops: sync SWA secrets** workflow)
4. Delete the previous private key in the GitHub App UI (revokes the leaked material)
5. Delete the local `.pem`
6. Verify Studio can still commit; re-run **Ops: monthly scorecard** if that job needs the App

App ID and installation ID rarely change; only update those Key Vault secrets if you recreate the App or reinstall it, then sync.

Workflows that need a Studio App installation token must call [`scripts/mint-github-app-token.sh`](../../scripts/mint-github-app-token.sh) only. That script writes the PEM to a temp file, masks **each line** with `::add-mask::`, then discards the file — it never `echo`s a multiline PEM (that dumps the key body into the Actions log). `npm run lint:actions-secrets` (and CI job **Actions secret-safety**) fails the build if workflows reintroduce PEM `with:` inputs, inline `GITHUB-APP-PRIVATE-KEY` fetches, or unsafe multiline masks.

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
