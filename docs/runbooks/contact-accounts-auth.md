# Runbook: Contact account authentication

**Audience:** Operators, implementers  
**Last updated:** 2026-09-12  
**Plan:** [`contact-accounts.md`](../plans/contact-accounts.md) (`ACCOUNT-P1-*`) · Phase 1b: [`contact-ciam-automation.md`](../plans/contact-ciam-automation.md) (`ACCOUNT-P1-007+`)

Students and parents sign in with **Google, Apple, or Microsoft** through **Entra External ID (CIAM)** — **one shared CIAM tenant**, not the workforce teaching tenant. Operators use workforce Entra for **`/studio`**.

---

## Runbooks (read in order)

| Step | Document | Who |
|------|----------|-----|
| 1 | **[contact-accounts-ciam-terraform.md](./contact-accounts-ciam-terraform.md)** | Terraform: CIAM tenant, OIDC apps, enterprise apps, vault, SWA, CD issuer patch, Graph apply hook (`ACCOUNT-P1-007`) |
| 2 | **[contact-accounts-social-idps.md](./contact-accounts-social-idps.md)** | Vendor consoles (Google / Apple / MSA) + Graph apply for IdPs, theme, and staging user flow (`ACCOUNT-P1-008`–`P1-011`) |
| 3 | This page | Architecture reference |

Configuration as code: [`infra/contact-ciam/README.md`](../../infra/contact-ciam/README.md) · [`contact-ciam-automation.md`](../plans/contact-ciam-automation.md).

Secret names: [rotate-secrets.md](./rotate-secrets.md) § Contact accounts.

---

## Two sign-in paths

| Audience | Login | SWA role | Routes |
|----------|-------|----------|--------|
| Operators | `/login` → Studio workspace or `/.auth/login/aad` | `studio` | `/studio`, `/studio/*` |
| Students / parents | `/login` → **Book or manage lessons**, **Continue with Google / Apple / Microsoft** (`domain_hint`), or `/.auth/login/contact` | `contact` | `/account`, `/account/*` |

`POST /api/authRoles` assigns roles by IdP. Unauthenticated protected routes → `/login?post_login_redirect_uri={url}`.

**Direct social sign-in (`ACCOUNT-P1-013`):** `/login` offers **Continue with Google / Apple / Microsoft** links that call `/.auth/login/contact?...&domain_hint={google|apple|live.com}`. SWA forwards `domain_hint` when `loginParameterNames` includes it in [`staticwebapp.config.json`](../../public/staticwebapp.config.json). Helpers: [`src/lib/contactAccounts.ts`](../../src/lib/contactAccounts.ts).

---

## Feature flag

| | |
|--|--|
| Terraform | `contact_accounts_enabled` |
| SWA | `CONTACT_ACCOUNTS_ENABLED` |
| Public API | `GET /api/contactAccountConfig` → `{ enabled }` only |
| Staging default | **true** |
| Prod default | **false** until `terraform apply -var='contact_accounts_enabled=true'` |

Independent of `LESSON_PAYMENTS_ENABLED`. Lesson and casting inquire stay **anonymous** always.

---

## If External ID is down

Rates and Turnstile inquire still work. Sign-in, `/account`, and (when shipped) schedule/book are unavailable until IdP recovery. Operators use workforce AAD for Studio independently.

---

## Related

- [authentication-authorization.md](../architecture/authentication-authorization.md)
- [manage-access.md](./manage-access.md)
- [cost-and-quotas.md](./cost-and-quotas.md) (CIAM MAU; Apple Developer non-Azure)
- [contact-ciam-automation.md](../plans/contact-ciam-automation.md) (per-env user flows, Graph apply backlog)
