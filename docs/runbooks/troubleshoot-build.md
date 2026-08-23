# Runbook: Troubleshoot build

## GitHub Actions failed

1. Open the failed workflow → build logs
2. Common causes:
   - Invalid content collection frontmatter (schema mismatch)
   - Syntax error in `.astro` / markdown
   - Missing `AZURE_STATIC_WEB_APPS_API_TOKEN`
3. Reproduce locally: `npm ci && npm run build` (requires `SITE_*` in `.env` — see [rotate-secrets](rotate-secrets.md))

## Frontmatter / content schema errors

Schemas live in `src/content.config.ts`. Fix the markdown fields (types, required keys, URL formats) and rebuild.

## Studio said it committed but site unchanged

1. Check GitHub `main` for the commit
2. Check Actions status — still running vs failed
3. Hard-refresh / wait ~30s for HTML revalidation. HTML is short-cached; hashed `/_astro/*` and derived images use new URLs after deploy. If a **stable original** under `/images/` still looks old, follow [swa-caching.md](swa-caching.md) rather than guessing at CDN.
4. Confirm you are looking at the custom domain that points to SWA (not EasyWP / old WordPress DNS)

## Studio publish errors

- **401** — not signed in, or signed in without `content.publish` ([manage-access](manage-access.md)). Sign-in alone is not publish permission.
- **AADSTS50105 (assignment required)** — Entra is blocking login before the app can authorize. Keep `require_app_role_assignment = false` and re-apply the env stack. Do not add Users and groups assignments as a workaround.
- **AADSTS50011 (redirect URI mismatch)** — the hostname you used is not registered; add it to `additional_auth_hostnames` and re-apply, then check `terraform output entra_redirect_uris`
- **500 / Missing env** — Key Vault secret empty/REPLACE_ME, or SWA app settings not synced after a vault update ([rotate-secrets](rotate-secrets.md)). If a setting still looks like `@Microsoft.KeyVault(...)`, managed Functions will not resolve it — run the sync script/workflow or terraform apply.
- **401 after updating ALLOWED-USER-IDS** — vault updated but SWA not synced yet (bootstrap only; live grants are `/studio/admin/access`)
- **GitHub 401/403 from Studio** — App private key / installation ID wrong, or App missing Contents:write ([github-app](github-app.md))
- **Gemini / quota / 429 (or friendly “temporarily unavailable”)** — confirm `GEMINI_MODEL` is a current model (default `gemini-3.6-flash`; `gemini-2.0-flash` is shut down). Match the API key’s Google project to the quotas in AI Studio / Cloud Console. Look up the user-facing **reference** (`correlationId`) in App Insights — see [observability](observability.md).
- **Any publish failure with a reference ID** — user-facing copy is intentionally non-technical; use the correlation ID in App Insights ([observability](observability.md))
- **Actions Azure OIDC login (`JSON is invalid: Expecting value`)** — transient. GitHub minted the federated token, then `az login` got an empty or HTML body from Azure AD / the management plane (same class as Azure CLI decode errors). Smoke and SWA deploy jobs retry via [`scripts/azure-oidc-login.sh`](../../scripts/azure-oidc-login.sh) (3 attempts). If every attempt fails, it is not this flake — treat it as a real auth/network problem.
- **Actions Azure OIDC login (`AADSTS700213`)** — federated subject mismatch. GitHub sends `repo:owner@OWNER_ID/repo@REPO_ID:...`. Compare the error’s subject to `terraform output github_actions_oidc_subjects`, then fix `github_owner_id` / `github_repo_id` and re-apply.
- **Actions cannot list SWA secrets** — OIDC principal needs Contributor on the Static Web App (granted by Terraform)
- **Build fails on missing `SITE_CONTACT_*` / `SITE_DATE_OF_BIRTH`** — Key Vault `SITE-*` secrets missing or still `REPLACE_ME`, or `AZURE_KEY_VAULT_NAME` not set on the GitHub environment ([rotate-secrets](rotate-secrets.md) site contact section). Deploy principal needs Key Vault Secrets User.
