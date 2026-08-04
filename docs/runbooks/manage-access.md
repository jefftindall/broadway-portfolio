# Runbook: Manage access

Only Elyse should be able to publish.

## Layers

1. **Entra app registration** (Terraform) — single-tenant, and the enterprise app requires explicit user assignment
2. **SWA Authentication** — only her identity provider account can sign in
3. **Route rules** — `/studio`, `/studio/*` (including help), and `/api/*` require `authenticated`
4. **Allowlist** — `ALLOWED-USER-IDS` in Key Vault must match her principal

| Environment | Key Vault | Enterprise app |
|---|---|---|
| Staging | `kv-elyse-staging` | `elyse-portfolio-staging` |
| Production | `kv-elyse-prod` | `elyse-portfolio-prod` |

**Sign-in ≠ publish.** A user assigned in Entra can open `/studio`, see their identity, and open **`/studio/help`** (voice guide and example prompts), but publishing still requires the allowlist. Studio checks access before showing the editor; signed-in non-publishers see a friendly denial with a **correlation ID**, plus a link to help. Look up that ID in App Insights (`StudioAccessDenied` / `StudioPublishDenied`) for `userId` / `userDetails` to add to `ALLOWED-USER-IDS` (see [observability.md](./observability.md)).

If a publisher shares a **reference** from a failed publish (not an access denial), look it up under `StudioPublishFailed` / exceptions in [observability.md](./observability.md) — that path is for diagnostics, not allowlist changes.

## Grant or revoke sign-in (Entra assignment)

Azure Portal → **Entra ID → Enterprise applications → `elyse-portfolio-staging` or `elyse-portfolio-prod` → Users and groups**.

Add Elyse there before her first login. Removing her assignment blocks sign-in entirely, independent of the allowlist.

## Find her principal IDs

1. Sign in to `/studio`
2. Open `/.auth/me` in the same browser session
3. Note `userId`, `userDetails`, and email claims
4. Set the allowlist (comma-separated, lowercase), e.g. `her@gmail.com,oid-guid-here`:

```bash
az keyvault secret set --vault-name kv-elyse-staging --name ALLOWED-USER-IDS --value "<ids>"
az keyvault secret set --vault-name kv-elyse-prod --name ALLOWED-USER-IDS --value "<ids>"
```

After updating the secret, sync into SWA ([rotate-secrets.md](./rotate-secrets.md#sync-swa-api-secrets-no-redeploy), **Actions → Sync SWA API secrets**, or `terraform apply`). Managed Functions do not read Key Vault references directly.

## Add a temporary publisher (emergency only)

1. Add their ID/email to `ALLOWED-USER-IDS` in both vaults (commands above)
2. Ensure they can authenticate via the configured IdP and are assigned to the enterprise app
3. Sync staging and prod ([rotate-secrets.md](./rotate-secrets.md#sync-swa-api-secrets-no-redeploy) or Sync SWA API secrets workflow once per environment)
4. Remove them immediately after the emergency

## Remove access

1. Remove from `ALLOWED-USER-IDS` in `kv-elyse-staging` and `kv-elyse-prod`, then sync both SWAs
2. Remove/disable their IdP assignment on the enterprise app
3. Confirm anonymous `/api/updateContent` returns 401/302
4. Confirm a signed-in non-allowlisted user sees the Studio publisher gate

## Review

Periodically check secret versions on `kv-elyse-staging` / `kv-elyse-prod` and IdP sign-in logs.
