# Runbook: Manage access

Sign-in is not permission to act. Studio authorization is one catalog of **discrete permissions**, bundled into **roles**, stored on **user profiles**. Publish and People use the same catalog — there is no separate publisher-only gate.

## Layers

1. **Entra app registration** (Terraform) — single-tenant (`AzureADMyOrg`). Enterprise-app **Assignment required** is **off** (`require_app_role_assignment = false`) so login is not blocked with `AADSTS50105`. Do not turn assignment required on to “secure” publish or People.
2. **SWA Authentication** — `/studio` and `/api/*` require a completed Entra login (`authenticated`). That only identifies the caller.
3. **Route rules** — `/studio`, `/studio/*` (including help), and `/api/*` require `authenticated`. Exceptions: `POST /api/contactInquiry`, `GET /api/lessonPayConfig`, and `POST /api/stripeWebhook` allow anonymous (same `private, no-store` cache).
4. **Authorization (application)** — every privileged Function calls `permissionGate()` against the catalog in [`api/src/lib/permissions.js`](../../api/src/lib/permissions.js):
   - **Publish / upload / discrete / publish status** — `content.publish`
   - **People / CRM** — `people.read` / `people.write` (one CRM per environment)
   - **Access admin** — `users.read` / `users.manage`
   - **Public exceptions** — Turnstile, sanitized Payment Links, or Stripe webhook signatures

| Environment | Key Vault | Enterprise app |
|---|---|---|
| Staging | `kv-elyse-staging` | `elyse-portfolio-staging` |
| Production | `kv-elyse-prod` | `elyse-portfolio-prod` |

**Sign-in ≠ permission.** A user who can authenticate may open `/studio`, `/studio/help`, and `/studio/health`. Hub tiles, People, and publish forms appear only for the permissions on their profile. The API re-checks every call (`GET /api/studioSession` is UI convenience only).

Look up a shared reference in App Insights (`StudioAccessDenied` / `StudioPublishDenied`) for `userId` / `userDetails` — see [observability.md](./observability.md).

## Source of truth: user profiles

Profiles live in Table Storage (`studioUsers` on the Studio CRM account). Each row has:

- Identity (Entra `userId`, email / UPN)
- **Roles** (`super_administrator`, `publisher`, `people`, `people_reader`; stored `owner` still means Super Administrator)
- **Extra permissions** (grant one catalog ID without the whole role)
- **Denied permissions** (strip an ID even if a role includes it)

Super Administrators manage this at **`/studio/access`**. Adding a discrete permission in code (`api/src/lib/permissions.js`) is how new capabilities are defined; the Access page reads that catalog from the session. Architecture: [`authentication-authorization.md`](../architecture/authentication-authorization.md).

### Bootstrap from `ALLOWED-USER-IDS`

The Key Vault allowlist is **not** a second permission model. On the first Studio session for an allowlisted caller who has no profile yet, the API writes a **Super Administrator** profile (all catalog permissions, including People and Access). After that, the profile is SoT:

- Changing roles or extra/denied permissions on `/studio/access` is how you grant or revoke publish and People
- Removing someone from `ALLOWED-USER-IDS` does **not** revoke a profile that already exists — disable or edit the profile
- Adding a new token to `ALLOWED-USER-IDS` still bootstraps Super Administrator on that person’s next sign-in (emergency publisher). Prefer `/studio/access` instead

```bash
az keyvault secret set --vault-name kv-elyse-staging --name ALLOWED-USER-IDS --value "<ids>"
az keyvault secret set --vault-name kv-elyse-prod --name ALLOWED-USER-IDS --value "<ids>"
```

After updating the secret, sync into SWA ([rotate-secrets.md](./rotate-secrets.md#sync-swa-api-secrets-no-redeploy), **Actions → Ops: sync SWA secrets**, or `terraform apply`). Managed Functions do not read Key Vault references directly.

## Grant or revoke sign-in

Sign-in follows the tenant directory, not an enterprise-app assignment list.

- **Allow sign-in:** the account must be able to authenticate to this Entra tenant (member or invited guest). No Users and groups assignment is required.
- **Block a specific person from Studio login:** remove or disable them in the tenant (or revoke their guest invite). Do **not** flip Assignment required on the SWA app.
- To keep sign-in but remove People or publish: edit or disable their profile on `/studio/access`.

## Find a principal

1. Sign in to `/studio`
2. Open `/.auth/me` in the same browser session
3. Note `userId`, `userDetails`, and email claims
4. Paste the email or `userId` into `/studio/access` → Add person

## Add a People operator or publisher

1. Confirm they can complete Entra login (tenant member or guest)
2. Open `/studio/access` as a Super Administrator
3. Add their email or user ID
4. Assign:
   - **People** — view and edit contacts (`people.read` + `people.write`)
   - **People (view only)** — `people.read`
   - **Publisher** — site updates only (`content.publish`)
   - **Super Administrator** — full catalog (not Azure / Entra Owner)
   - or tick **Extra permissions** for a single ID (for example `content.publish` without People)
5. Confirm they can open `/studio/people` after the next sign-in. There is one CRM per environment; permissions, not a partition key, decide who can see it.

## Remove publish or People access

1. On `/studio/access`, edit the profile: remove the role, deny the permission, or set status to **Disabled**
2. Confirm they can still sign in (expected) but the hub hides tiles they cannot use
3. Confirm `POST /api/updateContent` and `GET /api/contacts` return 401/403 for that account as appropriate

## Review

Periodically open `/studio/access` and check IdP sign-in logs. Do not treat `ALLOWED-USER-IDS` secret versions as the live permission list once profiles exist.
