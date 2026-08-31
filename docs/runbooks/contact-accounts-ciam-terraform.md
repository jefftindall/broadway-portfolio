# Runbook: Contact accounts — CIAM Terraform automation

**Audience:** Operators  
**Last updated:** 2026-08-31  
**Plan:** `ACCOUNT-P1-001` · **Related:** [contact-accounts-auth.md](./contact-accounts-auth.md) · [contact-accounts-social-idps.md](./contact-accounts-social-idps.md)

Terraform automates the **shared CIAM tenant**, **per-environment OIDC app registrations**, **Key Vault secrets**, **SWA app settings**, and **deploy-time issuer patching**. Social IdP buttons (Google / Apple / Microsoft personal) remain a **manual** Entra External ID step.

---

## What Terraform owns

| Layer | Stack | Resources |
|-------|-------|-----------|
| CIAM tenant (once) | `infra/bootstrap` | `azapi_resource.contact_ciam` → `kv-elyse-shared` secrets `CONTACT-CIAM-TENANT-ID`, `CONTACT-CIAM-DOMAIN-PREFIX`, `CONTACT-CIAM-OIDC-ISSUER` |
| OIDC app per env | `infra/environments/staging` · `prod` | `azuread_application.contact_swa` + `azuread_service_principal.contact_swa` in CIAM tenant; env vault `CONTACT-OIDC-CLIENT-ID`, `CONTACT-OIDC-CLIENT-SECRET` |
| Feature flag | env stacks | `contact_accounts_enabled` → SWA `CONTACT_ACCOUNTS_ENABLED` |
| SWA auth settings | env stacks | `CONTACT_OIDC_CLIENT_ID`, `CONTACT_OIDC_CLIENT_SECRET` (Key Vault reference) |
| Deploy artifact | CD | `scripts/sync-contact-oidc-issuer.mjs` patches `dist/staticwebapp.config.json` issuer from shared vault |

Committed `staticwebapp.config.json` files keep a **REPLACE_ME** issuer placeholder until bootstrap runs; CD injects the live issuer before SWA upload.

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
- **Application Administrator** on that service principal
- Shared vault secret **`CONTACT-CIAM-TF-CLIENT-ID`**

Apply (once, after Step 1 — requires **Application Administrator** or **Global Administrator** in the CIAM tenant for the operator running bootstrap):

```bash
cd infra/bootstrap
terraform apply -target=azuread_application.terraform_ciam \
  -target=azuread_service_principal.terraform_ciam \
  -target=azurerm_key_vault_secret.contact_ciam_tf_client_id
```

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

---

## Step 4 — CD issuer patch (automatic)

**CD: staging** / **CD: prod** run `node scripts/sync-contact-oidc-issuer.mjs dist` after Azure login. Manual:

```bash
node scripts/sync-contact-oidc-issuer.mjs dist
```

Reads **`CONTACT-CIAM-OIDC-ISSUER`** from `kv-elyse-shared`.

---

## Step 5 — Social IdPs (manual)

Follow **[contact-accounts-social-idps.md](./contact-accounts-social-idps.md)**.

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
| Redirect URI mismatch | Re-apply env after custom domain bound |
| App reg exists but missing from user flow **Add application** | Env apply must create `azuread_service_principal.contact_swa` (enterprise app). Re-apply staging/prod; for a pre-existing manual SP on staging, import per [contact-accounts-ciam-terraform.md](./contact-accounts-ciam-terraform.md) |

See [rotate-secrets.md](./rotate-secrets.md) § Contact accounts for secret names.
