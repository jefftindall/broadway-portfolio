# Runbook: Contact accounts — social identity providers (manual)

**Audience:** Operators  
**Last updated:** 2026-08-29  
**Plan:** `ACCOUNT-P1-004` · **Prerequisite:** [contact-accounts-ciam-terraform.md](./contact-accounts-ciam-terraform.md)

Configure **Google**, **Apple**, and **Microsoft personal** in the **CIAM tenant**. Do not use Studio Calendar OAuth clients or SWA-native social providers.

---

## Before you start

- [ ] CIAM tenant + staging OIDC app exist (Terraform runbook Steps 1–3)
- [ ] Entra admin center switched to the **CIAM tenant**

---

## Google

1. [Google Cloud Console](https://console.cloud.google.com/) — new project (not Calendar).
2. **OAuth consent screen** — External; app name; support email; domains `elysetindall.com`.
3. **Credentials** → OAuth client (Web). Redirect URI from CIAM: **External Identities** → **Google** → copy redirect URI (typically `https://{prefix}.ciamlogin.com/{tenant-id}/federation/oauth2`).
4. CIAM → **External Identities** → **Google** → paste client ID + secret.

Docs: [Google federation for customers](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-google-federation-customers)

---

## Apple

1. [Apple Developer Program](https://developer.apple.com/programs/) (~$99/yr).
2. Register **App ID** with Sign in with Apple.
3. Register **Services ID**; configure domains (`elysetindall.com`, `test.elysetindall.com`) and return URL from CIAM Apple IdP blade.
4. Create **Key** (.p8); note Key ID + Team ID.
5. CIAM → **Apple** IdP → enter Services ID, team, key.

Test **Hide My Email** once on staging — must not 500 the callback.

---

## Microsoft personal (MSA)

1. CIAM → **External Identities** → enable **Microsoft Account** (personal), not workforce tenant.
2. If using custom OIDC only, issuer `https://login.microsoftonline.com/consumers/v2.0` per current External ID docs.

---

## User flow

1. CIAM → **User flows** / default sign-in experience.
2. Enable Google, Apple, Microsoft Account; **no** local email/password on v1.
3. Link flow to **`elyse-portfolio-contact-staging`** app if required.

---

## Staging test checklist

| Step | Expected |
|------|----------|
| Google sign-in | `contact` role; `/account` OK |
| Apple sign-in | Same; try Hide My Email |
| Microsoft personal | Same |
| `/studio` as contact | Blocked → `/login` |
| Lesson inquire anonymous | Still works |

Device: **iPhone 17 · Safari**.

---

## Production

Add prod redirect URIs to Google/Apple apps when enabling prod (`contact_accounts_enabled=true`). Complete [contact-accounts-ciam-terraform.md](./contact-accounts-ciam-terraform.md) prod apply first.

---

## Checklist

- [ ] Apple Developer Program
- [ ] Google consent screen + federation client
- [ ] MSA / Microsoft Account on user flow
- [ ] Staging IdP round-trips (iPhone Safari)
