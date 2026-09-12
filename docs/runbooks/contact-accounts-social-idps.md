# Runbook: Contact accounts — social identity providers

**Audience:** Operators  
**Last updated:** 2026-09-12  
**Plan:** `ACCOUNT-P1-004` · Phase 1b: [`contact-ciam-automation.md`](../plans/contact-ciam-automation.md) (`ACCOUNT-P1-010`) · **Prerequisite:** [contact-accounts-ciam-terraform.md](./contact-accounts-ciam-terraform.md)

Configure **Google**, **Apple**, and **Microsoft personal** for the **CIAM tenant**. Vendor consoles create credentials; **`apply-contact-ciam-config.mjs`** syncs them from `kv-elyse-shared` to Entra. Do not use Studio Calendar OAuth clients or SWA-native social providers.

---

## Fixed reference (copy/paste)

All contact sign-in uses **one shared CIAM tenant**. Staging and prod each have their own SWA OIDC app registration in that tenant; social IdPs are configured **once** in CIAM and serve both environments.

### CIAM tenant (shared — staging + prod)


| Field                                  | Value                                                                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display name                           | `Elyse Tindall Contact Accounts`                                                                                                                                 |
| Tenant name (Entra **Name** / CIAM subdomain) | `elysecontacts` |
| Domain prefix | `elysecontacts` |
| Primary domain | `elysecontacts.onmicrosoft.com` |
| Tenant ID | `692675c7-5ecc-44d7-a2e6-f8e49e250e3e` |
| CIAM login host | `elysecontacts.ciamlogin.com` |
| OpenID issuer (SWA `contact` provider) | `https://692675c7-5ecc-44d7-a2e6-f8e49e250e3e.ciamlogin.com/692675c7-5ecc-44d7-a2e6-f8e49e250e3e/v2.0` (canonical; CD resolves from OIDC discovery) |
| Google OAuth redirect URIs (all required) | See [Google](#google) — path uses **tenant ID** or `{tenant-name}.onmicrosoft.com` |
| Apple **Domains and Subdomains** | `692675c7-5ecc-44d7-a2e6-f8e49e250e3e.ciamlogin.com` · `elysecontacts.ciamlogin.com` |
| Apple **Return URLs** (all three required) | See [Apple](#apple) — path uses **tenant name** `elysecontacts`, not the tenant GUID |
| Shared Key Vault                       | `kv-elyse-shared`                                                                                                                                                |
| Entra admin center (CIAM tenant)       | [Open CIAM tenant in Entra](https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/Overview&tenant=692675c7-5ecc-44d7-a2e6-f8e49e250e3e) |


### Workforce tenant (Studio only — **not** for contact IdPs)


| Field     | Value                                                                                |
| --------- | ------------------------------------------------------------------------------------ |
| Tenant ID | `e78bb87b-bdca-4a5f-8f90-a1c388528a5f`                                               |
| Use for   | `/.auth/login/aad`, `/studio`, Calendar OAuth — **do not** add Google/Apple/MSA here |


### Staging (test now)


| Field                                  | Value                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SWA name                               | `swa-elyse-portfolio-staging`                                                                                                                           |
| SWA default hostname                   | `ambitious-glacier-056054a0f.7.azurestaticapps.net`                                                                                                     |
| Public site hostname                   | `test.elysetindall.com`                                                                                                                                 |
| Env Key Vault                          | `kv-elyse-staging`                                                                                                                                      |
| CIAM app registration                  | `elyse-portfolio-contact-staging`                                                                                                                       |
| CIAM app (client) ID                   | `961894e2-e231-4b01-8a13-56fa85cf0492`                                                                                                                  |
| `CONTACT_ACCOUNTS_ENABLED`             | `true` (default)                                                                                                                                        |
| Contact OIDC redirect URIs (Terraform) | `https://ambitious-glacier-056054a0f.7.azurestaticapps.net/.auth/login/contact/callback` · `https://test.elysetindall.com/.auth/login/contact/callback` |
| Sign-in entry                          | `https://test.elysetindall.com/login` → **Book or manage lessons** → `/.auth/login/contact`                                                             |


### Production (after go-live)


| Field                                  | Value                                                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SWA name                               | `swa-elyse-portfolio-prod`                                                                                                                                                                                 |
| SWA default hostname                   | `white-coast-09962a50f.7.azurestaticapps.net`                                                                                                                                                              |
| Public site hostnames                  | `elysetindall.com` · `www.elysetindall.com`                                                                                                                                                                |
| Env Key Vault                          | `kv-elyse-prod`                                                                                                                                                                                            |
| CIAM app registration                  | `elyse-portfolio-contact-prod` (created on prod env Terraform apply)                                                                                                                                       |
| CIAM app (client) ID                   | Run command below after prod apply — not in vault until then                                                                                                                                               |
| `CONTACT_ACCOUNTS_ENABLED`             | `false` until `terraform apply -var='contact_accounts_enabled=true'`                                                                                                                                       |
| Contact OIDC redirect URIs (Terraform) | `https://white-coast-09962a50f.7.azurestaticapps.net/.auth/login/contact/callback` · `https://elysetindall.com/.auth/login/contact/callback` · `https://www.elysetindall.com/.auth/login/contact/callback` |
| Sign-in entry                          | `https://elysetindall.com/login` → **Book or manage lessons** → `/.auth/login/contact`                                                                                                                     |


---

## Verify / refresh values from Azure

Run from a machine with `az` logged in. These print **IDs and hostnames only** (never client secrets).

```bash
# CIAM metadata (shared)
az keyvault secret show --vault-name kv-elyse-shared --name CONTACT-CIAM-TENANT-ID --query value -o tsv
az keyvault secret show --vault-name kv-elyse-shared --name CONTACT-CIAM-DOMAIN-PREFIX --query value -o tsv
az keyvault secret show --vault-name kv-elyse-shared --name CONTACT-CIAM-OIDC-ISSUER --query value -o tsv

# Per-env SWA contact OIDC client IDs (public)
az keyvault secret show --vault-name kv-elyse-staging --name CONTACT-OIDC-CLIENT-ID --query value -o tsv
az keyvault secret show --vault-name kv-elyse-prod --name CONTACT-OIDC-CLIENT-ID --query value -o tsv

# SWA default hostnames (redirect URI list includes these)
az staticwebapp show --name swa-elyse-portfolio-staging --resource-group rg-elyse-portfolio-staging --query defaultHostname -o tsv
az staticwebapp show --name swa-elyse-portfolio-prod --resource-group rg-elyse-portfolio-prod --query defaultHostname -o tsv
```

Sign in to the CIAM tenant for Entra portal work (subscription optional):

```bash
az login --tenant 692675c7-5ecc-44d7-a2e6-f8e49e250e3e --allow-no-subscriptions
```

List contact app registrations in CIAM:

```bash
az ad app list \
  --filter "startswith(displayName,'elyse-portfolio-contact')" \
  --query "[].{name:displayName,clientId:appId}" \
  -o table \
  --tenant 692675c7-5ecc-44d7-a2e6-f8e49e250e3e
```

---

## Before you start

- [ ] [contact-accounts-ciam-terraform.md](./contact-accounts-ciam-terraform.md) Steps 1–3 complete for **staging** (prod app optional until go-live)
- [ ] Entra admin center switched to **Elyse Tindall Contact Accounts** (`692675c7-5ecc-44d7-a2e6-f8e49e250e3e`) — not the workforce tenant
- [ ] Portal path: **Identity** → **External Identities** → **All identity providers**

---

## Google

Use a **new** Google Cloud project (not the Studio Calendar project).

### 1. Google Cloud Console

1. [Google Cloud Console](https://console.cloud.google.com/) → create project **`elyse-contact-accounts`** (or similar).
2. **APIs & Services** → **OAuth consent screen**
   - User type: **External**
   - App name: `Elyse Tindall Contact Accounts`
   - User support email: your operator address
   - **Authorized domains:** add `ciamlogin.com`, `microsoftonline.com`, and `elysetindall.com` ([Microsoft requirement](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-google-federation-customers))
3. **Credentials** → **Create credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `Elyse CIAM federation`
   - **Authorized redirect URIs** — add **all** of the following (tenant name = `elysecontacts`, tenant ID = `692675c7-5ecc-44d7-a2e6-f8e49e250e3e`). SWA OIDC discovery uses the **tenant-ID hostname** (`692675c7-….ciamlogin.com`); missing those URIs causes Google **`redirect_uri_mismatch`** even when the `elysecontacts.ciamlogin.com` paths are present.

     ```
     https://login.microsoftonline.com
     https://login.microsoftonline.com/te/692675c7-5ecc-44d7-a2e6-f8e49e250e3e/oauth2/authresp
     https://login.microsoftonline.com/te/elysecontacts.onmicrosoft.com/oauth2/authresp
     https://elysecontacts.ciamlogin.com/692675c7-5ecc-44d7-a2e6-f8e49e250e3e/federation/oidc/accounts.google.com
     https://elysecontacts.ciamlogin.com/elysecontacts.onmicrosoft.com/federation/oidc/accounts.google.com
     https://elysecontacts.ciamlogin.com/692675c7-5ecc-44d7-a2e6-f8e49e250e3e/federation/oauth2
     https://elysecontacts.ciamlogin.com/elysecontacts.onmicrosoft.com/federation/oauth2
     https://692675c7-5ecc-44d7-a2e6-f8e49e250e3e.ciamlogin.com/692675c7-5ecc-44d7-a2e6-f8e49e250e3e/federation/oauth2
     https://692675c7-5ecc-44d7-a2e6-f8e49e250e3e.ciamlogin.com/692675c7-5ecc-44d7-a2e6-f8e49e250e3e/federation/oidc/accounts.google.com
     https://692675c7-5ecc-44d7-a2e6-f8e49e250e3e.ciamlogin.com/elysecontacts.onmicrosoft.com/federation/oauth2
     https://692675c7-5ecc-44d7-a2e6-f8e49e250e3e.ciamlogin.com/elysecontacts.onmicrosoft.com/federation/oidc/accounts.google.com
     ```

   - Do **not** add `test.elysetindall.com` or `elysetindall.com` redirect URIs here — Google redirects to CIAM, not SWA.
4. Copy the **Client ID** and **Client secret** → set in **`kv-elyse-shared`**:

   ```bash
   az keyvault secret set --vault-name kv-elyse-shared --name CONTACT-IDP-GOOGLE-CLIENT-ID --value '<client-id>'
   az keyvault secret set --vault-name kv-elyse-shared --name CONTACT-IDP-GOOGLE-CLIENT-SECRET --value '<client-secret>'
   ```

### 2. Sync to CIAM (Graph apply — not portal paste)

After KV secrets are set, run the apply script (or env `terraform apply` when `manage_contact_ciam_config=true`):

```bash
az login --tenant 692675c7-5ecc-44d7-a2e6-f8e49e250e3e --allow-no-subscriptions
export CONTACT_CIAM_TENANT_ID="$(az keyvault secret show --vault-name kv-elyse-shared --name CONTACT-CIAM-TENANT-ID --query value -o tsv)"
node scripts/apply-contact-ciam-config.mjs --dry-run --env staging
node scripts/apply-contact-ciam-config.mjs --env staging
```

Dry-run lists `CREATE` / `UPDATE identityProvider Google` only — never prints secrets. To force a credential-only refresh when public fields match, set `"resyncCredentials": true` temporarily in [`infra/contact-ciam/idps/google.json`](../../infra/contact-ciam/idps/google.json).

Docs: [Google federation for customers](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-google-federation-customers)

---

## Apple

Requires [Apple Developer Program](https://developer.apple.com/programs/) (~$99/yr). Use a **new** Services ID (not Calendar / Studio apps).

### 1. Apple Developer

1. **Certificates, Identifiers & Profiles** → **Identifiers** → **App IDs** → register (example):
  - Description: `Elyse Tindall Contact Sign-In`
  - Bundle ID: `com.elysetindall.contact` (explicit)
  - Capability: **Sign In with Apple**
2. **Identifiers** → **Services IDs** → register (example):
   - Description: `Elyse Tindall Contact Web`
   - Identifier: `com.elysetindall.contact.web` (this is the Apple **Client ID** / Services ID)
   - Enable **Sign In with Apple** → **Configure**:
     - **Primary App ID:** the App ID from step 1
     - **Domains and Subdomains** — CIAM login hosts only ([Microsoft Apple federation](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-apple-federation-customers)); **not** `elysetindall.com` / `test.elysetindall.com`:

       ```
       692675c7-5ecc-44d7-a2e6-f8e49e250e3e.ciamlogin.com
       elysecontacts.ciamlogin.com
       ```

     - **Return URLs** — add **all three** ([Microsoft lists three](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-apple-federation-customers)); lowercase; no trailing slash:

       ```
       https://692675c7-5ecc-44d7-a2e6-f8e49e250e3e.ciamlogin.com/elysecontacts/federation/oauth2
       https://elysecontacts.ciamlogin.com/elysecontacts/federation/oauth2
       https://692675c7-5ecc-44d7-a2e6-f8e49e250e3e.ciamlogin.com/692675c7-5ecc-44d7-a2e6-f8e49e250e3e/federation/oauth2
       ```

     - Do **not** use only `https://elysecontacts.ciamlogin.com/692675c7-5ecc-44d7-a2e6-f8e49e250e3e/federation/oauth2` — that skips the required `*.ciamlogin.com` domains and the tenant-**name** path URLs above.
3. **Keys** → create key with **Sign In with Apple** → download `.p8` once.
   - Note **Key ID** and **Team ID** (Membership page).
4. Store in **`kv-elyse-shared`** (Services ID, Team ID, Key ID, `.p8` body):

   ```bash
   az keyvault secret set --vault-name kv-elyse-shared --name CONTACT-IDP-APPLE-SERVICES-ID --value '<services-id>'
   az keyvault secret set --vault-name kv-elyse-shared --name CONTACT-IDP-APPLE-TEAM-ID --value '<team-id>'
   az keyvault secret set --vault-name kv-elyse-shared --name CONTACT-IDP-APPLE-KEY-ID --value '<key-id>'
   az keyvault secret set --vault-name kv-elyse-shared --name CONTACT-IDP-APPLE-PRIVATE-KEY --file AuthKey_XXXXX.p8
   ```

### 2. Sync to CIAM (Graph apply)

Same as Google — `node scripts/apply-contact-ciam-config.mjs --env staging` after KV is populated. Portal **Apple** paste is superseded by automation (`ACCOUNT-P1-010`).

Test **Hide My Email** once on **staging** (`https://test.elysetindall.com/login`) — callback must not 500.

---

## Microsoft personal (MSA)

Configured only in the **CIAM** tenant (`692675c7-5ecc-44d7-a2e6-f8e49e250e3e`).

Automation treats MSA as the **built-in Microsoft Account** provider (`Microsoft-OAuth` in [`microsoft-personal.json`](../../infra/contact-ciam/idps/microsoft-personal.json)). No separate Google-style client is required.

1. CIAM tenant → **External Identities** → **All identity providers**.
2. Confirm **Microsoft Account** (personal `@outlook.com` / `@hotmail.com` / `@live.com`) is enabled — **not** “Microsoft Entra ID” for your workforce tenant.
3. If the built-in provider is missing, enable it once in the portal; subsequent applies noop.

Optional custom OIDC (consumers issuer) is supported via `spec.type: "oidc"` and `CONTACT-IDP-MSA-*` KV secrets — not used by default.

Issuer if using custom OIDC:

```
https://login.microsoftonline.com/consumers/v2.0
```

---

## CIAM login theme (tenant-level)

Branding is automated separately from IdPs ([`ACCOUNT-P1-011`](../plans/contact-ciam-automation.md)). Desired state: [`infra/contact-ciam/branding/theme.json`](../../infra/contact-ciam/branding/theme.json) + [`banner-logo.png`](../../infra/contact-ciam/branding/banner-logo.png) (ink `#0e0d0c`, Elyse sign-in copy, CIAM-sized banner logo ≤245×36px). External ID user flows use Graph **beta** `organizationalBrandingTheme` with `isDefaultTheme: true`, not company branding alone.

```bash
node scripts/apply-contact-ciam-config.mjs --dry-run --env staging
node scripts/apply-contact-ciam-config.mjs --env staging
```

Set `"resyncLogo": true` in `theme.json` temporarily to re-upload the banner logo when text/colors already match.

---

## User flows (one per environment — not one shared flow)

Target architecture ([`contact-ciam-automation.md`](../plans/contact-ciam-automation.md)): **separate** sign-in flows so staging can be tested before prod promotion. Social IdPs stay **tenant-level** (same Google/Apple/MSA for both flows).

| Environment | User flow name (target) | Enterprise app |
|-------------|-------------------------|----------------|
| Staging | `contact-signin-staging` | `elyse-portfolio-contact-staging` |
| Production | `contact-signin-prod` | `elyse-portfolio-contact-prod` |

Manifests: [`infra/contact-ciam/flows/staging.json`](../../infra/contact-ciam/flows/staging.json) ( **`spec` shipped** — social-only + minimal attributes) · [`prod.json`](../../infra/contact-ciam/flows/prod.json) (promote after staging validation). Graph create/update runs via `apply-contact-ciam-config.mjs` on env Terraform apply.

**First-time sign-in:** CIAM may still show a one-time **Add details** / confirm screen even when `email` and `displayName` are hidden in the flow — that is a platform limitation. Full profile editing belongs on **`/account`** (`ACCOUNT-P2-003`).

### Enterprise app (service principal)

CIAM user flows associate **enterprise applications** (service principals), not bare app registrations. Env Terraform creates **`azuread_service_principal.contact_swa`** alongside each OIDC app. Confirm under **Enterprise applications** → `elyse-portfolio-contact-{staging|prod}`.

### Graph apply (preferred)

After KV IdP secrets are set and staging OIDC client id is known:

```bash
export CONTACT_CIAM_TENANT_ID="$(az keyvault secret show --vault-name kv-elyse-shared --name CONTACT-CIAM-TENANT-ID --query value -o tsv)"
export CONTACT_OIDC_CLIENT_ID="$(az keyvault secret show --vault-name kv-elyse-staging --name CONTACT-OIDC-CLIENT-ID --query value -o tsv)"
node scripts/apply-contact-ciam-config.mjs --dry-run --env staging
node scripts/apply-contact-ciam-config.mjs --env staging
```

This creates/updates **`contact-signin-staging`** with Google, Apple, and Microsoft Account only (no email/password) and hidden attribute collection per [`staging.json`](../../infra/contact-ciam/flows/staging.json).

### Portal (interim fallback)

If you already created **one** portal user flow with both apps linked, sign-in still works. Before prod go-live, split into **`contact-signin-staging`** and **`contact-signin-prod`** (portal edit now, or Graph apply when P1-008 lands).

Manual steps (same IdPs on each flow):

1. CIAM tenant → **External Identities** → **User flows**.
2. Create or edit **`contact-signin-staging`** (staging) and **`contact-signin-prod`** (prod) — or one interim flow if not split yet.
3. **Identity providers**: enable **Google**, **Apple**, and **Microsoft Account**. Leave **local email/password disabled** on v1.
4. **Applications** → **Add application** — link **only** the matching env app:
   - **Staging flow:** `elyse-portfolio-contact-staging` (`961894e2-e231-4b01-8a13-56fa85cf0492`)
   - **Prod flow:** `elyse-portfolio-contact-prod` (client ID from `kv-elyse-prod` / `az ad app list` above)

Do **not** link both SWA apps to a single prod-bound flow once P1-008 is live — staging flow changes would affect production.

---

## Staging test checklist

Base URL: **`https://test.elysetindall.com`**


| Step               | Command / URL                                                    | Expected                       |
| ------------------ | ---------------------------------------------------------------- | ------------------------------ |
| Feature flag       | `curl -s https://test.elysetindall.com/api/contactAccountConfig` | `{"enabled":true}`             |
| Login chooser      | `https://test.elysetindall.com/login`                            | Student path visible           |
| Google sign-in     | Book or manage lessons → Google                                  | `contact` role; `/account` OK  |
| Apple sign-in      | Same; try Hide My Email                                          | Same; no 500 on callback       |
| Microsoft personal | Same with personal MSA                                           | Same                           |
| Role check         | `https://test.elysetindall.com/.auth/me` (after sign-in)         | `userRoles` includes `contact` |
| Studio gate        | `https://test.elysetindall.com/studio` as contact user           | Blocked → `/login`             |
| Anonymous inquire  | `https://test.elysetindall.com/contact` (no login)               | Still works                    |


Device reference: **iPhone 17 · Safari**.

---

## Production go-live additions

Complete [contact-accounts-ciam-terraform.md](./contact-accounts-ciam-terraform.md) **prod apply** first (`elyse-portfolio-contact-prod` + redirect URIs for `elysetindall.com` / `www.elysetindall.com`).

Then:

1. Create or confirm **`contact-signin-prod`** user flow with Google/Apple/MSA enabled; link **only** `elyse-portfolio-contact-prod` (not the staging app).
2. **Google** — no redirect URI change (CIAM URLs above are env-agnostic). Optionally add `elysetindall.com` to OAuth consent **Authorized domains** if not already present.
3. **Apple** — no change (CIAM `*.ciamlogin.com` domains and return URLs are env-agnostic).
4. Enable feature flag:
  ```bash
   cd infra/environments/prod
   terraform apply -var='contact_accounts_enabled=true'
   ./scripts/sync-swa-api-secrets.sh prod
   node scripts/sync-contact-oidc-issuer.mjs dist   # or let CD patch issuer
  ```
5. Smoke on **`https://elysetindall.com/login`** and **`https://www.elysetindall.com/login`**.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Google **`Error 400: redirect_uri_mismatch`** after choosing Google on CIAM | Google OAuth client missing **tenant-ID hostname** redirect URIs | Add the four `https://692675c7-5ecc-44d7-a2e6-f8e49e250e3e.ciamlogin.com/.../federation/...` URIs above (especially `.../692675c7-.../federation/oauth2`). Save, wait ~5 min, retry. |
| **Continue with Google** still shows CIAM IdP picker first | Old deploy used query `domain_hint` on `/.auth/login/contact` (SWA does not forward dynamic hints) | Redeploy with **`contact-google`** / **`contact-apple`** / **`contact-microsoft`** SWA providers (`loginParameterNames: ["domain_hint=google"]`, etc.). Generic **Book or manage lessons** still uses `contact` and shows the picker. |
| CIAM page loads but Google/Apple/MSA buttons missing | IdP secrets `REPLACE_ME` or Graph apply not run | Populate `CONTACT-IDP-*` in `kv-elyse-shared`, run `node scripts/apply-contact-ciam-config.mjs --env staging`. |

To confirm the redirect URI Google rejected: open browser devtools → Network on the Google error page → inspect the `redirect_uri` query param on `accounts.google.com/o/oauth2/v2/auth`. It must match an **Authorized redirect URI** exactly.

---

## Checklist

- [ ] Apple Developer Program active
- [ ] Google OAuth client with CIAM federation redirect URI
- [ ] Google + Apple + Microsoft Account enabled on **staging** user flow (`contact-signin-staging` or interim shared flow)
- [ ] `elyse-portfolio-contact-staging` linked to **staging** flow only
- [ ] Staging IdP round-trips on `test.elysetindall.com` (iPhone Safari)
- [ ] (Prod) `contact-signin-prod` + `elyse-portfolio-contact-prod` linked + `contact_accounts_enabled=true`

---

## Related

- [contact-accounts-ciam-terraform.md](./contact-accounts-ciam-terraform.md)
- [contact-accounts-auth.md](./contact-accounts-auth.md)
- [contact-ciam-automation.md](../plans/contact-ciam-automation.md) (`ACCOUNT-P1-008`–`P1-011`)
- [infra/contact-ciam/README.md](../../infra/contact-ciam/README.md)
- [rotate-secrets.md](./rotate-secrets.md) § Contact accounts

