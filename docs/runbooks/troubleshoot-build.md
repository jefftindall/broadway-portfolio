# Runbook: Troubleshoot build

## GitHub Actions failed

1. Open the failed workflow → build logs
2. Common causes:
   - Invalid content collection frontmatter (schema mismatch)
   - Syntax error in `.astro` / markdown
   - Missing `AZURE_STATIC_WEB_APPS_API_TOKEN`
3. Reproduce locally: `npm ci && npm run build`

## Frontmatter / content schema errors

Schemas live in `src/content.config.ts`. Fix the markdown fields (types, required keys, URL formats) and rebuild.

## Studio said it committed but site unchanged

1. Check GitHub `main` for the commit
2. Check Actions status — still running vs failed
3. Hard-refresh / CDN cache: wait 1–2 minutes more
4. Confirm you are looking at the custom domain that points to SWA (not old WordPress DNS)

## Studio publish errors

- **401** — not signed in, not assigned to the Entra enterprise app, or not on allowlist ([manage-access](manage-access.md))
- **AADSTS50011 (redirect URI mismatch)** — the hostname you used is not registered; add it to `additional_auth_hostnames` and re-apply, then check `terraform output entra_redirect_uris`
- **500 / Missing env** — Key Vault secret empty/REPLACE_ME, or SWA app settings not synced after a vault update ([rotate-secrets](rotate-secrets.md)). If a setting still looks like `@Microsoft.KeyVault(...)`, managed Functions will not resolve it — run the sync script/workflow or terraform apply.
- **401 allowlist after updating ALLOWED-USER-IDS** — vault updated but SWA not synced yet
- **GitHub 401/403 from Studio** — App private key / installation ID wrong, or App missing Contents:write ([github-app](github-app.md))
- **Gemini / quota / 429 (or friendly “temporarily unavailable”)** — confirm `GEMINI_MODEL` is a current model (default `gemini-3.6-flash`; `gemini-2.0-flash` is shut down). Match the API key’s Google project to the quotas in AI Studio / Cloud Console. Look up the user-facing **reference** (`correlationId`) in App Insights — see [observability](observability.md).
- **Any publish failure with a reference ID** — user-facing copy is intentionally non-technical; use the correlation ID in App Insights ([observability](observability.md))
- **Actions `azure/login` OIDC failure (`AADSTS700213`)** — federated subject mismatch. GitHub sends `repo:owner@OWNER_ID/repo@REPO_ID:...`. Compare the error’s subject to `terraform output github_actions_oidc_subjects`, then fix `github_owner_id` / `github_repo_id` and re-apply.
- **Actions cannot list SWA secrets** — OIDC principal needs Contributor on the Static Web App (granted by Terraform)
