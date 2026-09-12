# CIAM configuration as code (ACCOUNT-P1-007+)

**One shared CIAM tenant** (`elysecontacts`). Staging and prod each get their **own user flow** and **OIDC app**; Google / Apple / MSA IdPs are **tenant-level** (configured once).

Version-controlled desired state for Entra External ID **user flows**, **identity providers**, and **login branding**. Applied by [`scripts/apply-contact-ciam-config.mjs`](../../scripts/apply-contact-ciam-config.mjs) via Microsoft Graph on env `terraform apply`.

| Path | Scope | Action ID |
|------|-------|-----------|
| `flows/staging.json` | Staging user flow only | `ACCOUNT-P1-008` / `P1-009` |
| `flows/prod.json` | Production user flow only | `ACCOUNT-P1-008` |
| `idps/*.json` | Tenant-level IdPs (shared) | `ACCOUNT-P1-010` |
| `branding/theme.json` | Tenant-level sign-in theme | `ACCOUNT-P1-011` |

**Promotion:** change staging → apply staging → validate on `test.elysetindall.com` → reconcile prod JSON → apply prod. See [`contact-ciam-automation.md`](../../docs/plans/contact-ciam-automation.md).

**Secrets:** IdP credentials live in `kv-elyse-shared` (names only in git). The apply script reads secret **names** from idp manifests (`ACCOUNT-P1-010`); values never appear in this tree. Set `"resyncCredentials": true` in an idp manifest to force a credential-only PATCH when public fields match.
