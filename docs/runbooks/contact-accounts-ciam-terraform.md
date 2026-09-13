# Runbook: Contact accounts — CIAM Terraform automation

**Audience:** Operators  
**Last updated:** 2026-09-12  
**Plan:** `ACCOUNT-P1-001` · **Related:** [contact-accounts-auth.md](./contact-accounts-auth.md) · [contact-accounts-social-idps.md](./contact-accounts-social-idps.md)

Terraform automates the **shared CIAM tenant**, **per-environment OIDC app registrations** (and enterprise apps / service principals), **Key Vault secrets**, **SWA app settings**, **deploy-time issuer patching**, and a **Graph apply hook** for user flows / IdPs / branding ([`ACCOUNT-P1-007`](../plans/contact-ciam-automation.md)). **Google Cloud / Apple Developer** vendor setup stays manual; Entra IdP federation moves to Graph in **`ACCOUNT-P1-010`** (credentials in `kv-elyse-shared`).

---

## What Terraform owns

| Layer | Stack | Resources |
|-------|-------|-----------|
| CIAM tenant (once) | `infra/bootstrap` | `azapi_resource.contact_ciam` → `kv-elyse-shared` secrets `CONTACT-CIAM-TENANT-ID`, `CONTACT-CIAM-DOMAIN-PREFIX`, `CONTACT-CIAM-OIDC-ISSUER` |
| OIDC app per env | `infra/environments/staging` · `prod` | `azuread_application.contact_swa` + `azuread_service_principal.contact_swa` in CIAM tenant; env vault `CONTACT-OIDC-CLIENT-ID`, `CONTACT-OIDC-CLIENT-SECRET` |
| Feature flag | env stacks | `contact_accounts_enabled` → SWA `CONTACT_ACCOUNTS_ENABLED` |
| SWA auth settings | env stacks | `CONTACT_OIDC_CLIENT_ID`, `CONTACT_OIDC_CLIENT_SECRET` (Key Vault reference) |
| Deploy artifact | CD | `scripts/sync-contact-oidc-issuer.mjs` patches `dist/staticwebapp.config.json` issuer from shared vault |
| CIAM user flows / IdPs / branding | env stacks | `terraform_data.contact_ciam_config` → `scripts/apply-contact-ciam-config.mjs` (Graph; `ACCOUNT-P1-007+`) |

Committed `staticwebapp.config.json` files keep a **REPLACE_ME** issuer placeholder until bootstrap runs; CD injects the live issuer before SWA upload.

Graph apply reads version-controlled manifests under [`infra/contact-ciam/`](../contact-ciam/README.md). Per-environment **user flows** (`flows/staging.json`, `flows/prod.json`) ship in `ACCOUNT-P1-008`; IdP federation (`P1-010`) and branding theme (`P1-011`) are implemented — populate `CONTACT-IDP-*` in `kv-elyse-shared` before apply creates/updates IdPs.

---

## Prerequisites

- Azure subscription access (same as existing bootstrap)
- **User Administrator** or **Global Administrator** on the workforce tenant (CIAM tenant creation)
- **Application Administrator** on the CIAM tenant (for env apply that creates OIDC apps)
- GitHub repo secret **TF_GITHUB_TOKEN** (PAT for Terraform provider)
- **az** CLI + **terraform** ≥ 1.5 locally for first bootstrap apply

---

## Step 1 — Bootstrap: create the CIAM tenant

```bash
cd infra/bootstrap
terraform init -input=false
terraform plan -input=false -out=tfplan
terraform apply tfplan
```

Default prefix **`elysecontacts`**. SWA **`openIdIssuer`** must match OIDC discovery’s **`issuer`** field (tenant-id hostname):

`https://692675c7-5ecc-44d7-a2e6-f8e49e250e3e.ciamlogin.com/692675c7-5ecc-44d7-a2e6-f8e49e250e3e/v2.0`

CD resolves this from discovery when patching `dist/staticwebapp.config.json`. If taken:

```bash
terraform plan -var='contact_ciam_domain_prefix=elysetindallcontacts' -out=tfplan
```

Confirm secrets exist (show **names/ids only**, never values in chat):

```bash
az keyvault secret show --vault-name kv-elyse-shared --name CONTACT-CIAM-TENANT-ID --query id -o tsv
```

**Tenant already created in portal:**

```bash
terraform apply \
  -var='manage_contact_ciam_tenant=false' \
  -var='contact_ciam_tenant_id=<guid>' \
  -var='contact_ciam_domain_prefix=elysecontacts'
```

After the tenant exists, set **`manage_contact_ciam_tenant = false`** on subsequent bootstrap applies.

---

## Step 2 — Authorize GitHub Actions in the CIAM tenant

Bootstrap Terraform registers **`elyse-portfolio-gha-ciam-terraform`** in the CIAM tenant (mirror of workforce `elyse-portfolio-gha-terraform`):

- GitHub OIDC federated credentials for **staging**, **prod**, and **pull_request** subjects
- **Application Administrator** on that service principal (Terraform `azuread` provider)
- Microsoft Graph **application** permissions for `apply-contact-ciam-config.mjs`, resolved from the **CIAM tenant’s** Microsoft Graph enterprise app (role GUIDs differ from workforce): `IdentityProvider.ReadWrite.All`, `Organization.ReadWrite.All`, `OrganizationalBranding.ReadWrite.All`, `EventListener.ReadWrite.All`, `Application.ReadWrite.All` (admin-consented on the CIAM GHA app)
- Shared vault secret **`CONTACT-CIAM-TF-CLIENT-ID`**

Apply (once, after Step 1 — requires **Application Administrator** or **Global Administrator** in the CIAM tenant for the operator running bootstrap):

```bash
cd infra/bootstrap
terraform apply -target=azuread_application.terraform_ciam \
  -target=azuread_service_principal.terraform_ciam \
  -target=azuread_app_role_assignment.terraform_ciam_graph \
  -target=azurerm_key_vault_secret.contact_ciam_tf_client_id
```

Until Step 2 includes the Graph permission grants, env `terraform apply` may defer IdP / user-flow Graph writes when the hook cannot read remote state; branding apply still runs when planned. Re-run bootstrap Step 2 after changing `contact_ciam_gha.tf` so role IDs resolve from the CIAM tenant Graph SP.

Env stacks use `azuread.contact_ciam` with `CONTACT-CIAM-TF-CLIENT-ID` when GitHub Actions sets `TF_VAR_contact_ciam_azuread_use_oidc=true` (Terraform plan/apply jobs). Local `terraform apply` continues to use your interactive `az login` session (`contact_ciam_azuread_use_oidc` defaults to false).

**Manual fallback** (if bootstrap apply cannot create CIAM apps): Entra admin center → CIAM tenant → **Roles and administrators** → **Application Administrator** → assign your operator account, run env apply locally once, then re-run bootstrap GHA resources above.


---

## Step 3 — Staging / prod apply

```bash
az login
cd infra/environments/staging
terraform init -input=false
terraform plan -input=false -out=tfplan
terraform apply tfplan
```

When `CONTACT-CIAM-TENANT-ID` is a real GUID, Terraform creates **`elyse-portfolio-contact-staging`**, its **enterprise application** (service principal — required for CIAM user-flow association), redirect URIs for `/.auth/login/contact/callback`, and env vault OIDC secrets.

```bash
terraform output contact_oidc_client_id
terraform output contact_ciam_oidc_issuer
./scripts/sync-swa-api-secrets.sh staging
```

Optional local config sync:

```bash
node scripts/sync-contact-oidc-issuer.mjs repo
```

Repeat for **`infra/environments/prod`** when ready (creates `elyse-portfolio-contact-prod` app registration + enterprise app).

### One-time import (staging SP created before Terraform)

If the staging enterprise app was created manually (`az ad sp create`) before `azuread_service_principal.contact_swa` landed, import it once (object ID from **Enterprise applications** in the CIAM tenant):

```bash
cd infra/environments/staging
terraform import 'module.portfolio.azuread_service_principal.contact_swa[0]' '/servicePrincipals/<service-principal-object-id>'
```

Prod needs no import when the SP is created by the first apply after this change.

### Step 3b — CIAM Graph config (ACCOUNT-P1-007)

After Step 3, env `terraform apply` runs [`scripts/apply-contact-ciam-config.mjs`](../../scripts/apply-contact-ciam-config.mjs) when `manage_contact_ciam_config=true` (default). It plans user flows, IdPs, and branding from [`infra/contact-ciam/`](../../infra/contact-ciam/README.md) via Microsoft Graph.

**Local apply** — sign in to the **workforce tenant** (for `kv-elyse-shared` / env vault reads). The apply script mints CIAM Graph tokens with `az account get-access-token --tenant <CONTACT-CIAM-TENANT-ID>`; you do **not** need `az login` into the CIAM tenant unless token mint fails. Delegated operators without **Organizational Branding Administrator** / **External ID User Flow Administrator** in the CIAM tenant can still dry-run; full writes run in GitHub Actions via `CONTACT-CIAM-TF` (OIDC + application permissions from Step 2).

**Dry-run only** (no Graph writes):

```bash
CONTACT_CIAM_TENANT_ID="$(az keyvault secret show --vault-name kv-elyse-shared --name CONTACT-CIAM-TENANT-ID --query value -o tsv)"
CONTACT_OIDC_CLIENT_ID="$(az keyvault secret show --vault-name kv-elyse-staging --name CONTACT-OIDC-CLIENT-ID --query value -o tsv)"
node scripts/apply-contact-ciam-config.mjs --dry-run --env staging
```

**Skip hook** — emergency or plan-only:

```bash
terraform apply -var='contact_ciam_skip_apply=true' tfplan
# or
CONTACT_CIAM_SKIP_APPLY=true node scripts/apply-contact-ciam-config.mjs --env staging
```

**GitHub Actions** — the hook mints a CIAM federated session when `CONTACT_CIAM_TF_CLIENT_ID` and GitHub OIDC env vars are present (same app as `azuread.contact_ciam`). If Graph permissions are not yet consented, set `-var='contact_ciam_skip_apply=true'` until [`contact-ciam-automation.md`](../plans/contact-ciam-automation.md) `P1-010` admin-consent step is done.

Create/update bodies for **user flows** apply from `flows/{env}.json` when `spec` is present (`ACCOUNT-P1-008` staging shipped). **IdPs** (`P1-010`) and **branding** (`P1-011`) apply when KV secrets / theme spec are ready; Google/Apple skip gracefully while `CONTACT-IDP-*` values are `REPLACE_ME`.

---

## Step 4 — CD issuer patch (automatic)

**CD: staging** / **CD: prod** run `node scripts/sync-contact-oidc-issuer.mjs dist` after Azure login. Manual:

```bash
node scripts/sync-contact-oidc-issuer.mjs dist
```

Reads **`CONTACT-CIAM-OIDC-ISSUER`** from `kv-elyse-shared`.

---

## Step 5 — Social IdPs and user flows

**Vendor consoles (always manual):** follow **[contact-accounts-social-idps.md](./contact-accounts-social-idps.md)** for Google Cloud, Apple Developer, and MSA app setup.

**Entra / Graph (moving to as-code):**

| Piece | Today | Target (`ACCOUNT-*`) |
|-------|-------|----------------------|
| IdP credentials in Entra | Graph apply from `CONTACT-IDP-*` in `kv-elyse-shared` | `ACCOUNT-P1-010` |
| Login theme | Graph beta `organizationalBrandingTheme` from `infra/contact-ciam/branding/` | `ACCOUNT-P1-011` |
| User flow per environment | Staging `spec` in repo; prod after promotion | `ACCOUNT-P1-008`: `contact-signin-staging` via Graph apply; prod JSON pending `P1-014` |
| Apply on env Terraform | Step 3b (`apply-contact-ciam-config.mjs`) | Idempotent; prod flow skips until `flows/prod.json` gains `spec` |

If you already linked both SWA apps to **one** portal user flow, that works until P1-008 splits flows — see the runbook migration note.

---

## Step 6 — Verify staging

1. `GET /api/contactAccountConfig` → `{ "enabled": true }`
2. `/login` → student path → CIAM with social buttons
3. `/.auth/me` → `contact` role after sign-in
4. `/account` loads; `/studio` still gated for operators

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| No OIDC app in plan | `CONTACT-CIAM-TENANT-ID` still `REPLACE_ME` |
| Authorization error on apply | Application Administrator in **CIAM** tenant |
| SWA OIDC failure | Issuer patch + `CONTACT_OIDC_*` SWA settings |
| CIAM Graph apply deferred / unbranded login | Bootstrap Step 2: CIAM GHA app must declare Graph roles on the **CIAM tenant** Microsoft Graph SP (GUIDs differ from workforce). Needs `OrganizationalBranding.ReadWrite.All` + `EventListener.ReadWrite.All` + `IdentityProvider.ReadWrite.All`. Until company branding exists, first POST `/branding/localizations` may be required — apply script falls back from beta themes automatically. |
| `AADB2C90063` on IdP create | CIAM tenant missing **Azure Active Directory Authentication Extensions** enterprise app, or the SP was just created and has not propagated yet. Bootstrap creates it (`azuread_service_principal.aad_auth_extensions`); apply script also ensures it via Graph before IdP writes and retries IdP/user-flow mutations with backoff. Google IdP bodies must include `identityProviderType: Google` (beta Graph). Re-run bootstrap apply once if the SP is missing, then staging/prod apply. |
| App reg exists but missing from user flow **Add application** | Env apply must create `azuread_service_principal.contact_swa` (enterprise app). Re-apply staging/prod; for a pre-existing manual SP on staging, import per [contact-accounts-ciam-terraform.md](./contact-accounts-ciam-terraform.md) |

See [rotate-secrets.md](./rotate-secrets.md) § Contact accounts for secret names.
