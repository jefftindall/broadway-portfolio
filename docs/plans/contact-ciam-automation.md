# Plan: CIAM user flows as code (per environment)

**Artifact ID:** `ELYSE-ACCOUNT-CIAM-001`  
**Version:** 1.0  
**Last updated:** 2026-09-12 (`ACCOUNT-P1-012` `wont_fix` — custom URL domain cost-prohibitive)  
**Audience:** Agents, implementers, operators  
**Parent plan:** [`contact-accounts.md`](./contact-accounts.md) (`ACCOUNT-P1-007`–`P1-014`)  
**Scope:** Replace portal click-ops for Entra External ID (CIAM) **user flows**, **social IdP federation**, and **login branding** with version-controlled automation. **One user flow per environment** so staging can be exercised before prod promotion. Reduce first-time sign-in friction (social-only, minimal attribute collection). Branded login uses the **free default `*.ciamlogin.com` host** + company theme (`P1-011`); **`login.elysetindall.com` is out of scope** (`P1-012` `wont_fix`).

Use **Action ID** (`ACCOUNT-P1-007` … `ACCOUNT-P1-014`) in PR titles and commits.

Example PR title: `ACCOUNT-P1-008: Per-env CIAM user flows via Graph`

**Status values:** `planned` · `in_progress` · `blocked` · `done` · `wont_fix`

---

## Context

Phase 1 shipped SWA → CIAM OIDC wiring, roles, `/login`, and the feature flag. What remains is **CIAM tenant configuration** that today lives in the Entra admin center:

| Area | Today | Pain |
|------|-------|------|
| Enterprise app for user-flow picker | Was manual `az ad sp create`; now **`azuread_service_principal.contact_swa`** in env Terraform ([#129](https://github.com/jefftindall/broadway-portfolio/pull/129)) | — |
| Social IdPs (Google, Apple, MSA) | [`contact-accounts-social-idps.md`](../runbooks/contact-accounts-social-idps.md) manual steps | Drift, no staging/prod isolation for flow changes |
| User flow | One shared flow (or none) for both SWA apps | Cannot test a flow change on staging without affecting prod |
| First federated sign-in | CIAM **Add details** page after Google/Apple/MSA | Extra step; profile belongs on `/account` (Phase 2) |
| Login chrome | Default Microsoft CIAM (`*.ciamlogin.com`) | Theme (`P1-011`) + `/login` UX (`P1-013`) mitigate; custom URL domain rejected (~$35/mo Front Door — `P1-012` `wont_fix`) |

**Already in Terraform (keep):** CIAM tenant (bootstrap), per-env OIDC app + **service principal** (`contact_ciam_entra.tf`), KV secrets, GHA CIAM principal with Application Administrator.

**Not available in `hashicorp/azuread`:** External ID user flows, federated identity providers, company branding themes. Automate via **Microsoft Graph** (`az rest` or Node script).

---

## Target architecture

```text
                    kv-elyse-shared (IdP creds, tenant metadata)
                                    │
                    scripts/apply-contact-ciam-config.mjs
                    (Graph: identityProviders + authenticationEventsFlows + branding)
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼                                                   ▼
   staging env apply                              prod env apply (after promotion)
          │                                                   │
          ▼                                                   ▼
 contact-signin-staging                          contact-signin-prod
   + elyse-portfolio-contact-staging SP             + elyse-portfolio-contact-prod SP
          │                                                   │
          ▼                                                   ▼
 test.elysetindall.com                            elysetindall.com / www
   /.auth/login/contact                              /.auth/login/contact
```

### Per-environment user flows

| Environment | User flow name (stable id in repo) | Linked enterprise app | SWA host(s) |
|-------------|-----------------------------------|------------------------|-------------|
| **staging** | `contact-signin-staging` | `elyse-portfolio-contact-staging` | `test.elysetindall.com` |
| **prod** | `contact-signin-prod` | `elyse-portfolio-contact-prod` | `elysetindall.com`, `www.elysetindall.com` |

**Shared across envs (tenant-level):** Google, Apple, and Microsoft personal IdP definitions — credentials live once in `kv-elyse-shared`. Both flows **enable the same three IdPs**; only the **application association** and **Run now** redirect base differ.

**Promotion contract:** Change flow JSON under `infra/contact-ciam/flows/staging.json` → apply staging → manual + automated sign-in checks on `test.elysetindall.com` → copy/reconcile to `flows/prod.json` → prod env apply. Do **not** edit prod flow in the portal without a matching PR.

### Streamlined sign-in (friction)

| Rule | Implementation |
|------|----------------|
| Social only | User flow: **no** local email+password, **no** email OTP in v1 |
| IdP picker | Google, Apple, Microsoft personal enabled on the flow |
| First-time profile | Graph `onAttributeCollection`: **displayName** and **email** from IdP claims, **hidden or read-only** where supported; no extra custom fields |
| Residual “Add details” | Built-in CIAM may still show a one-time confirm screen — minimize fields; full edit moves to **`/account`** (`ACCOUNT-P2-*`) |
| Optional site UX | `/login` provider shortcut buttons (all route to CIAM picker; `domain_hint` direct hop blocked on desktop CIAM — `AADSTS90023`) |

### Branded login

| Layer | What users see | Status |
|-------|----------------|--------|
| **A. Branding theme** | Dark stage background, gold CTAs, Figtree/Cormorant where Entra allows; CIAM-sized banner logo in repo | **`done`** (`P1-011`) — Graph `organizationalBrandingTheme` (beta) in `infra/contact-ciam/branding/` |
| **B. Custom URL domain** | `https://login.elysetindall.com/{tenant-id}/…` instead of `*.ciamlogin.com` | **`wont_fix`** (`P1-012`) — Microsoft requires **Azure Front Door Standard ~$35/mo**; no supported cheaper proxy; low login volume does not justify doubling Azure spend |

Brand tokens (from [`style-guide.md`](../style-guide.md)):

| Token | Hex | Use on CIAM theme |
|-------|-----|-------------------|
| `ink` | `#0e0d0c` | Page background |
| `spotlight` | `#f3ebe0` | Primary text |
| `gold` | `#c4a35a` | Primary buttons |
| `gel` | `#3d8b8b` | Links / secondary accents |
| `panel` | `#241f1a` | Card surfaces |

**Custom URL domain (`P1-012` `wont_fix`):** [Microsoft custom URL domain](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-custom-url-domain) requires **Azure Front Door** (~**$35/mo** base; ~doubles current Azure expected spend). DIY proxies (Functions, App Service, nginx) are **not supported** for Entra custom URL domain registration. Revisit only if Microsoft ships third-party integration without Front Door or login volume justifies the cost. Until then: **`elysecontacts.ciamlogin.com`** + theme + `/login` direct buttons.

---

## Configuration as code layout

```text
infra/contact-ciam/
  flows/
    staging.json          # desired state for contact-signin-staging
    prod.json             # desired state for contact-signin-prod
  idps/
    google.json           # federation metadata shape (secrets by KV name ref)
    apple.json
    microsoft-personal.json
  branding/
    theme.json            # colors, logo URL, sign-in page text
scripts/
  apply-contact-ciam-config.mjs   # idempotent Graph apply
  apply-contact-ciam-config.test.mjs
```

**Secrets (names only in git):** extend `kv-elyse-shared` per [`rotate-secrets.md`](../runbooks/rotate-secrets.md):

| Secret | Purpose |
|--------|---------|
| `CONTACT-IDP-GOOGLE-CLIENT-ID` / `…-SECRET` | Google federation (not Calendar clients) |
| `CONTACT-IDP-APPLE-SERVICES-ID` / `…-KEY-ID` / `…-TEAM-ID` / `…-PRIVATE-KEY` | Sign in with Apple |
| `CONTACT-IDP-MSA-CLIENT-ID` / `…-SECRET` | Microsoft personal OIDC |
| Existing `CONTACT-CIAM-TENANT-ID`, `CONTACT-CIAM-TF-CLIENT-ID` | Graph auth (OIDC from GHA / local operator) |

Script reads env: `CONTACT_CIAM_ENV=staging|prod`, `CONTACT_CIAM_TENANT_ID`, flow file path, `--dry-run`.

**Terraform hook:** `terraform_data.contact_ciam_config` in the portfolio module runs the script after OIDC app + SP exist — triggered on each env `terraform apply`. Requires CIAM tenant Graph session (local `az login --tenant` or GHA federated `CONTACT-CIAM-TF-CLIENT-ID`). Skip with `CONTACT_CIAM_SKIP_APPLY=true` or `-var='contact_ciam_skip_apply=true'`.

**Graph permissions (CIAM GHA app):** `Policy.ReadWrite.ApplicationConfiguration`, `IdentityProvider.ReadWrite.All`, `Organization.ReadWrite.All` (branding), `Application.ReadWrite.All` (flow ↔ app link). Grant on CIAM tenant only.

---

## Phased backlog

### Phase 1b — CIAM automation (extends Phase 1)

**Goal:** Staging contact sign-in is fully configured from the repo; prod receives the same config only after staging validation.

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `ACCOUNT-P1-007` | Graph apply script + env Terraform hook | `done` | `ACCOUNT-P1-001` | `scripts/apply-contact-ciam-config.mjs`; `infra/contact-ciam/`; `contact_ciam_config.tf` |
| `ACCOUNT-P1-008` | Per-env user flows (staging + prod JSON) | `in_progress` | `P1-007` | staging `spec` in `infra/contact-ciam/flows/staging.json` |
| `ACCOUNT-P1-009` | Minimal attribute collection (social-only) | `done` | `P1-008` | flow JSON `onAttributeCollection` |
| `ACCOUNT-P1-010` | IdP federation from KV (Google / Apple / MSA) | `done` | `P1-007` | `infra/contact-ciam/idps/`; KV secrets |
| `ACCOUNT-P1-011` | CIAM company branding theme (site colors) | `done` | `P1-007` | `infra/contact-ciam/branding/` |
| `ACCOUNT-P1-012` | Custom URL domain `login.elysetindall.com` | `wont_fix` | — (cost-prohibitive; Front Door required) | — |
| `ACCOUNT-P1-013` | `/login` provider shortcut buttons (CIAM picker) | `done` (runbook) | `P1-008` | `src/pages/login.astro`; `contactAccounts.ts` |
| `ACCOUNT-P1-014` | Promotion runbook + smoke/journey updates | `planned` | `P1-008`–`P1-013` | runbooks; `tests/smoke/contact-accounts.spec.ts` |

<details>
<summary><code>ACCOUNT-P1-007</code> — Graph automation foundation</summary>

**Acceptance criteria**

- [x] `apply-contact-ciam-config.mjs` authenticates to CIAM tenant (OIDC client creds from KV / `az login --tenant`)
- [x] `--dry-run` prints intended creates/updates/deletes (IDs and names only — never secrets)
- [x] Idempotent apply: second run is no-op when manifest `spec` blocks are absent (P1-008+ adds writes)
- [x] Unit tests for JSON normalization and diff logic
- [x] Env Terraform `terraform_data.contact_ciam_config` runs script on apply when `contact_ciam_ready`; documented skip when `CONTACT_CIAM_SKIP_APPLY=true`
- [x] [`contact-accounts-ciam-terraform.md`](../runbooks/contact-accounts-ciam-terraform.md) updated with apply step

</details>

<details>
<summary><code>ACCOUNT-P1-008</code> — Per-environment user flows</summary>

**Acceptance criteria**

- [x] `contact-signin-staging` Graph body in repo (`flows/staging.json` `spec`) — associates **only** staging SP via `CONTACT_OIDC_CLIENT_ID`
- [ ] `contact-signin-prod` exists and associates **only** with prod SP (promote after staging validation — `P1-014`)
- [x] Staging authorize uses staging OIDC app (Terraform redirect URIs include `test.elysetindall.com`)
- [x] Prod flow not modified by staging applies (`CONTACT_CIAM_ENV` selects `flows/{env}.json`; prod JSON still lacks `spec`)
- [ ] Portal manual flow documented as superseded once Graph apply succeeds on staging

</details>

<details>
<summary><code>ACCOUNT-P1-009</code> — Reduce sign-in friction</summary>

**Acceptance criteria**

- [x] User flow disables email+password and email OTP (social IdPs only in `spec.identityProviders`)
- [x] Google, Apple, MSA enabled on the flow (`Google-OAUTH`, `Apple-OAUTH`, `Microsoft-OAuth`)
- [x] `onAttributeCollection` maps **displayName** + **email** hidden/read-only from IdP (`spec.onAttributeCollection`)
- [x] Residual first-time confirm screen limitation documented — profile editing deferred to `/account` (`ACCOUNT-P2-003`); CIAM may still show a one-time confirm when IdP omits claims
- [ ] Staging: Google sign-in reaches SWA callback without operator-only portal edits (operator after Graph apply + KV IdPs)

</details>

<details>
<summary><code>ACCOUNT-P1-010</code> — IdP federation as code</summary>

**Acceptance criteria**

- [x] Graph creates/updates tenant IdPs from KV-backed credentials (`scripts/lib/contact-ciam-apply.mjs`, `CONTACT-IDP-*` in `kv-elyse-shared`)
- [x] Google redirect URIs match CIAM federation endpoints (tenant ID + `elysecontacts.onmicrosoft.com` paths) — vendor console + runbook
- [x] Apple domains: `*.ciamlogin.com`; return URLs use tenant **name** `elysecontacts` — vendor console + runbook
- [x] MSA uses built-in Microsoft Account provider (`spec.type: builtin`) — not workforce tenant
- [x] [`contact-accounts-social-idps.md`](../runbooks/contact-accounts-social-idps.md) trimmed to **one-time vendor console** steps; Entra IdP enablement via apply script
- [ ] Closes open `ACCOUNT-P1-004` ACs when staging round-trips pass (operator: populate KV secrets, apply, test on `test.elysetindall.com`)

</details>

<details>
<summary><code>ACCOUNT-P1-011</code> — Branded CIAM theme</summary>

**Acceptance criteria**

- [x] Theme uses ink / gold / gel / spotlight palette and CIAM-sized banner logo (`infra/contact-ciam/branding/theme.json` + `banner-logo.png`; ink `#0e0d0c`)
- [x] Sign-in page copy matches voice-lessons tone (no “Azure AD” jargon)
- [ ] Staging visually recognizable as Elyse Tindall on iPhone Safari (operator after apply)
- [x] Theme JSON in repo; apply script syncs to Graph beta branding theme (`isDefaultTheme`, `pageBackgroundColor`, banner logo upload)

</details>

<details>
<summary><code>ACCOUNT-P1-012</code> — Custom URL domain (`wont_fix` — cost-prohibitive)</summary>

**Decision (2026-09-12):** Not planned. Entra External ID custom URL domains require Azure Front Door Standard (~**$35/mo** fixed), with no supported cheaper alternative at low volume. Stay on **`elysecontacts.ciamlogin.com`** + `P1-011` theme.

**Acceptance criteria** (not pursued)

- [ ] DNS `login.elysetindall.com` → Front Door → CIAM custom domain registered
- [ ] SWA `openIdIssuer` + CD discovery patch use custom domain authority
- [ ] Apple/Google redirect URIs updated if Microsoft docs require custom-domain variants
- [ ] [`cost-and-quotas.md`](../runbooks/cost-and-quotas.md) + `budget.tf` updated for Front Door steady-state cost
- [ ] Default `*.ciamlogin.com` **not** blocked until custom domain verified in production

</details>

<details>
<summary><code>ACCOUNT-P1-013</code> — Site login UX</summary>

**Acceptance criteria**

- [x] `/login` student section offers **Continue with Google / Apple / Microsoft** (in addition to “Book or manage lessons”)
- [x] Links use SWA-safe `post_login_redirect_uri` via generic `contact` provider (no `domain_hint` — desktop CIAM returns `AADSTS90023`)
- [x] Operator Studio path unchanged
- [ ] Direct skip of CIAM picker via `domain_hint` — **blocked** on desktop web (Microsoft External ID service limitation; reopen if fixed)
- [x] Smoke covers `login-contact-{google,apple,microsoft}` test ids and CIAM redirect without `domain_hint`

</details>

<details>
<summary><code>ACCOUNT-P1-014</code> — Promotion + verification</summary>

**Acceptance criteria**

- [ ] Runbook section: **Promote CIAM config staging → prod** (order: IdPs → theme → flow; **`P1-012` skipped**)
- [ ] Smoke: staging Google + Apple + MSA complete (or documented skip with reason)
- [ ] `ACCOUNT-P1-003` iPhone Safari AC checked when IdPs live
- [ ] `ACCOUNT-P1-004` checklist fully `[x]` after automation + staging validation

</details>

---

## Suggested implementation order

```text
PR #129 merge (enterprise SP in TF)
    └─► ACCOUNT-P1-007 script + hook
            ├─► P1-010 IdPs (tenant-level, once)
            ├─► P1-011 branding theme
            └─► P1-008 staging flow ─► P1-009 friction ─► P1-013 /login UX
                        └─► P1-014 staging validation
                                    └─► P1-008 prod flow + P1-014 prod promotion
                        P1-012 custom URL domain — wont_fix (Front Door ~$35/mo)
ACCOUNT-P2-* may proceed in parallel once staging sign-in returns tokens
```

**Suggested next PR:** `ACCOUNT-P1-014` staging validation + prod flow promotion (`flows/prod.json` `spec` after staging round-trips).

---

## Operator work that stays manual (vendor consoles)

Automation does **not** replace:

| Vendor | One-time / periodic operator task |
|--------|-----------------------------------|
| Google Cloud | OAuth consent screen, create web client, paste id/secret → KV |
| Apple Developer | Services ID, `.p8` key, domains on `*.ciamlogin.com` → KV |
| Microsoft Entra (workforce) | Unchanged — Studio only |
| DNS | No CIAM custom subdomain — `P1-012` `wont_fix` |

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Graph API schema drift | Pin flow JSON to documented Graph version; contract tests |
| Built-in flow cannot skip “Add details” entirely | Minimize attributes; `/account` owns edits |
| Custom domain breaks SWA issuer | N/A — `P1-012` `wont_fix`; issuer stays `*.ciamlogin.com` |
| Front Door cost (~$35/mo) | Rejected for `P1-012`; would ~double Azure expected spend at current volume |
| Shared IdP creds across envs | Acceptable — same CIAM tenant; isolation is **user flow + OIDC app**, not separate Google clients |
| Secret echo in CI | Script follows [`never-echo-secrets.mdc`](../../.cursor/rules/never-echo-secrets.mdc) |

---

## Out of scope

| Item | Why |
|------|-----|
| Second CIAM tenant for staging | One tenant; per-env **flows** give isolation |
| SWA-native Google/Apple providers | CIAM federation remains primary (`contact-accounts.md` option C rejected) |
| Workforce Entra guest students | Unchanged non-goal |
| Custom auth cookies | SWA Easy Auth stays |
| Entra External ID premium SMS MFA | Not needed at volume |
| CIAM custom URL domain `login.elysetindall.com` (`P1-012`) | Cost-prohibitive — Front Door required; theme on `*.ciamlogin.com` is sufficient |

---

## Related

| Doc | Role |
|-----|------|
| [`contact-accounts.md`](./contact-accounts.md) | Parent backlog; Phase 2+ blocked on working sign-in |
| [`contact-accounts-ciam-terraform.md`](../runbooks/contact-accounts-ciam-terraform.md) | Tenant + OIDC TF; extend with apply hook |
| [`contact-accounts-social-idps.md`](../runbooks/contact-accounts-social-idps.md) | Vendor console steps → KV; supersede portal flow sections |
| [`contact-accounts-auth.md`](../runbooks/contact-accounts-auth.md) | End-user auth paths |
| [`style-guide.md`](../style-guide.md) | Brand tokens for `P1-011` |
| [`authentication-authorization.md`](../architecture/authentication-authorization.md) | Update if issuer/custom domain changes SWA contract |
