# Runbook: Contact account authentication

**Audience:** Operators, implementers  
**Last updated:** 2026-08-29  
**Plan:** [`contact-accounts.md`](../plans/contact-accounts.md) (`ACCOUNT-P1-*`)

Students and parents sign in with **Google, Apple, or Microsoft** through **Entra External ID (CIAM)**. Operators use workforce Entra for **`/studio`**.

---

## Runbooks (read in order)

| Step | Document | Who |
|------|----------|-----|
| 1 | **[contact-accounts-ciam-terraform.md](./contact-accounts-ciam-terraform.md)** | Terraform: CIAM tenant, OIDC apps, vault, SWA, CD issuer patch |
| 2 | **[contact-accounts-social-idps.md](./contact-accounts-social-idps.md)** | Manual: Google, Apple, Microsoft personal in CIAM |
| 3 | This page | Architecture reference |

Secret names: [rotate-secrets.md](./rotate-secrets.md) § Contact accounts.

---

## Two sign-in paths

| Audience | Login | SWA role | Routes |
|----------|-------|----------|--------|
| Operators | `/login` → Studio workspace or `/.auth/login/aad` | `studio` | `/studio`, `/studio/*` |
| Students / parents | `/login` → Book or manage lessons or `/.auth/login/contact` | `contact` | `/account`, `/account/*` |

`POST /api/authRoles` assigns roles by IdP. Unauthenticated protected routes → `/login?post_login_redirect_uri={url}`.

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
