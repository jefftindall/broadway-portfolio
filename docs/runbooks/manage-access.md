# Runbook: Manage access

Only Elyse should be able to **publish**. Anyone in the Entra tenant (members and guests) should be able to **sign in**. Sign-in is not permission to act.

## Layers

1. **Entra app registration** (Terraform) — single-tenant (`AzureADMyOrg`). Enterprise-app **Assignment required** is **off** (`require_app_role_assignment = false`) so login is not blocked with `AADSTS50105`. Do not turn assignment required on to “secure” publish.
2. **SWA Authentication** — `/studio` and `/api/*` require a completed Entra login (`authenticated`). That only identifies the caller.
3. **Route rules** — `/studio`, `/studio/*` (including help), and `/api/*` require `authenticated`. Exceptions: `POST /api/contactInquiry`, `GET /api/lessonPayConfig`, and `POST /api/stripeWebhook` allow anonymous (same `private, no-store` cache).
4. **Authorization (application)** — every privileged Function re-checks independently of SWA:
   - **Publish / upload / discrete / publish status** — `ALLOWED-USER-IDS` via `publisherGate()`
   - **People / CRM** — signed-in principal + owner-scoped Table Storage (`studioOwnerKey`); never an owner id from the request body
   - **Public exceptions** — Turnstile, sanitized Payment Links, or Stripe webhook signatures

| Environment | Key Vault | Enterprise app |
|---|---|---|
| Staging | `kv-elyse-staging` | `elyse-portfolio-staging` |
| Production | `kv-elyse-prod` | `elyse-portfolio-prod` |

**Sign-in ≠ publish.** A user who can authenticate may open `/studio`, see their identity, open **`/studio/help`**, and use People for **their** partition. Publishing still requires the allowlist. Studio checks access before showing the editor; signed-in non-publishers see a friendly denial with a **correlation ID**, plus a link to help. Look up that ID in App Insights (`StudioAccessDenied` / `StudioPublishDenied`) for `userId` / `userDetails` to add to `ALLOWED-USER-IDS` (see [observability.md](./observability.md)).

If a publisher shares a **reference** from a failed publish (not an access denial), look it up under `StudioPublishFailed` / exceptions in [observability.md](./observability.md) — that path is for diagnostics, not allowlist changes.

## Grant or revoke sign-in

Sign-in follows the tenant directory, not an enterprise-app assignment list.

- **Allow sign-in:** the account must be able to authenticate to this Entra tenant (member or invited guest). No Users and groups assignment is required.
- **Block a specific person from Studio login:** remove or disable them in the tenant (or revoke their guest invite). Do **not** flip Assignment required on the SWA app — that blocks *everyone* who is not assigned (`AADSTS50105`) and is the wrong layer for authorization.
- The monitor user assignment in Terraform is only a fallback if `require_app_role_assignment` is ever turned back on. Leave it; do not use the Portal Users and groups list as the live access model.

## Find a principal for the publish allowlist

1. Sign in to `/studio`
2. Open `/.auth/me` in the same browser session
3. Note `userId`, `userDetails`, and email claims
4. Set the allowlist (comma-separated, lowercase), e.g. `her@gmail.com,oid-guid-here`:

```bash
az keyvault secret set --vault-name kv-elyse-staging --name ALLOWED-USER-IDS --value "<ids>"
az keyvault secret set --vault-name kv-elyse-prod --name ALLOWED-USER-IDS --value "<ids>"
```

After updating the secret, sync into SWA ([rotate-secrets.md](./rotate-secrets.md#sync-swa-api-secrets-no-redeploy), **Actions → Ops: sync SWA secrets**, or `terraform apply`). Managed Functions do not read Key Vault references directly.

## Add a temporary publisher (emergency only)

1. Confirm they can complete Entra login (tenant member or guest)
2. Add their ID/email to `ALLOWED-USER-IDS` in both vaults (commands above)
3. Sync staging and prod ([rotate-secrets.md](./rotate-secrets.md#sync-swa-api-secrets-no-redeploy) or **Ops: sync SWA secrets** workflow once per environment)
4. Remove them immediately after the emergency

## Remove publish access

1. Remove from `ALLOWED-USER-IDS` in `kv-elyse-staging` and `kv-elyse-prod`, then sync both SWAs
2. Confirm they can still sign in (expected) but cannot publish
3. Confirm anonymous `/api/updateContent` returns 401/302
4. Confirm a signed-in non-allowlisted user sees the Studio publisher gate

People data stays in that user’s partition; removing them from the allowlist does not grant access to anyone else’s contacts.

## Review

Periodically check secret versions on `kv-elyse-staging` / `kv-elyse-prod` and IdP sign-in logs.
