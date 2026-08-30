# Plan: Contact account management

**Artifact ID:** `ELYSE-ACCOUNT-001`  
**Version:** 1.1  
**Last updated:** 2026-08-28  
**Audience:** Agents, implementers, operators  
**Scope:** Public-site **contact accounts** so students (and parents) can sign in with Google, Apple, or Microsoft, maintain profile and preferences, **see the schedule and book a slot**, and **review their lesson history**. The whole contact-account surface is behind a **runtime feature flag**. **Lesson and casting inquiries stay anonymous forever** — potential clients must never be forced to log in to write Elyse. Studio (`/studio`) stays the operator workspace. People CRM stays the relationship SoT. Stripe stays money. Google Calendar stays time.

Use the **Action ID** column (`ACCOUNT-*`) to reference items in PRs, issues, and commits.

Example PR title: `ACCOUNT-P2-003: Add /account profile and preferences`

**Status values:** `planned` · `in_progress` · `blocked` · `done` · `wont_fix`

**Implementation stance:** This document is the backlog. Prefer **one phase (or one `ACCOUNT-*` item) per PR**. Phase 0 (this plan) is done. Do **not** invite students into the workforce Entra tenant. Do **not** put student chrome on `/studio`. Do **not** buy Auth0, Clerk, Firebase Auth, or a student-portal SaaS.

---

## North star

When the flag is **on**, students sign in on **elysetindall.com** with an identity they already have (**Google, Apple, or Microsoft**), land on a thin **`/account`** surface (not Studio), and can (1) update the contact fields they own, (2) **see open times and book a slot**, and (3) **see their lesson history**. **Anyone can always submit a lesson or casting inquiry without logging in.** Rates and Payment Links stay public. The flag is **off** on production until go-live (same habit as `LESSON_PAYMENTS_ENABLED`).

### Two audiences, two identity systems

| Audience | Where they work | How they sign in | What login grants |
|----------|-----------------|------------------|-------------------|
| **Operators** (Elyse, helpers) | `/studio` | Workforce Microsoft Entra (`AzureADMyOrg`) — unchanged | Identity only. Catalog on `studioUsers` still authorizes publish / People / Calendar / Access |
| **Contacts** (students, parents) | `/account` (profile, preferences, **history**); `/lessons/book` **schedule + book** when the flag is on | Entra **External ID** (CIAM) federating Google, Apple, and Microsoft personal accounts | Identity only. They may read/write **their linked People row**, view **their** lessons, and book **their** slots. Never `people.write` on the whole CRM. Inquiry does not use this session |

```text
Student  ──Google / Apple / Microsoft──►  Entra External ID  ──SWA OIDC──►  /.auth/login/contact
Operator ──Microsoft work/school────────►  Workforce Entra     ──SWA AAD──►  /.auth/login/aad
                                              │
                                              ▼
                                    rolesSource assigns SWA role
                                    studio  |  contact
                                              │
                         ┌────────────────────┴────────────────────┐
                         ▼                                         ▼
                   /studio + permissionGate                  /account (history + profile)
                   People CRM (full)                         schedule + book (flag on)
```

### Systems of record (unchanged owners)

| Concern | SoT | Account system’s job |
|---------|-----|----------------------|
| **Who is this person?** | People CRM (`contacts` table) | Link a login to an existing row (email match) or create one. Do not fork a second student database |
| **Who just signed in?** | Entra External ID (contact) / workforce Entra (Studio) | Prove identity. Store provider + subject on the contact, not a parallel profile table of record |
| **What may they do?** | Application gates | `contact` SWA role + “this principal owns this `contactId`”. Studio catalog is not used for student APIs |
| **Time** | Google Calendar + `studioLessons` | Same `STUDIO-P3` path when **booking a slot**; `contactId` comes from the session. History reads the same lesson rows |
| **Money** | Stripe | Payment Links stay **no account required**. Login is for schedule / book / history, not paying |
| **Inquiry** | `POST /api/contactInquiry` (Turnstile) | **Never** requires a contact session — lesson or casting |

### Non-negotiables

| Rule | Meaning |
|------|---------|
| **Students are not Studio users** | No `studioUsers` row. No `/studio` SWA role. No guest invite into the teaching tenant |
| **Login ≠ CRM write on everyone** | A contact may PATCH **their** row’s self-serve fields. `people.write` remains operator-only |
| **One person, one contact** | First verified email from the IdP matches an active People row → **link**, do not duplicate. Operators merge leftovers in Studio |
| **Inquiry never requires login** | `type=lesson` and `type=casting` `InquiryForm` stay Turnstile + anonymous, **flag on or off**. Potential clients must be able to write Elyse without an account |
| **Rates stay public** | `/lessons/book` copy and prices remain anonymous |
| **Flag gates schedule, book, and `/account`** | See [Feature flag](#feature-flag). Not the same setting as `LESSON_PAYMENTS_ENABLED` |
| **Casting stays anonymous** | Do not force agents to create accounts |
| **No PII in git / logs** | Same CRM contract: kinds + contact id + `correlationId`. Never emails, tokens, or Apple relay addresses in logs |
| **Cheap store first** | Identities live on the existing CRM storage account (new table or columns — not Postgres). External ID core is free through **50,000 MAU**; this studio will not approach that. Recalc [`cost-and-quotas.md`](../runbooks/cost-and-quotas.md) + budget in the **same** PR if a billable SKU is added |
| **iPhone 17 · Safari** | Sign-in buttons, `/account` (including history), and the book gate must work there (Apple Sign In in particular) |

---

## Status at a glance

| Phase / area | Status | Open residuals |
|--------------|--------|----------------|
| Phase 0 — Plan + Action IDs + SoT | `done` | — |
| Phase 1 — Student identity (External ID + SWA roles) | `planned` | Operator: External ID tenant, Google/Apple/Microsoft apps, Apple Developer Program |
| Phase 2 — Link login → People + `/account` | `planned` | After P1 |
| Phase 3 — Flag + login-gated schedule/book | `planned` | Inquiry stays anonymous; `STUDIO-P5-001` uses this bind |
| Phase 4 — Lesson history + parent booking | `planned` | History is part of `/account`; required before prod flag-on |

**Suggested next:** `ACCOUNT-P1-001` (External ID tenant + SWA custom OIDC), then `ACCOUNT-P1-006` (flag). Do **not** start `STUDIO-P5-001` until Phase 3 can bind a booker. Inquiry never waits on this track.

---

## How to use this document

| Section | Purpose |
|---------|---------|
| [North star](#north-star) | Two audiences, SoT, non-negotiables |
| [Status at a glance](#status-at-a-glance) | Done vs not done |
| [Identity integration choice](#identity-integration-choice) | Why External ID, not guests or SWA-native social-only |
| [Feature flag](#feature-flag) | What `CONTACT_ACCOUNTS_ENABLED` turns on vs always-on inquire |
| [Contact link rules](#contact-link-rules) | Email match, Apple Hide My Email, parents |
| [Self-serve fields](#self-serve-profile-and-preferences) | What students may edit vs operator-only |
| [Schedule, booking, and inquiry](#schedule-booking-and-inquiry) | Inquire always; schedule/book/history when flagged |
| [Phased backlog](#phased-backlog) | Implementable `ACCOUNT-*` work |
| [Out of scope](#out-of-scope) | Explicit non-goals |

---

## Identity integration choice

Pick the option that **keeps Studio’s workforce tenant clean**, **lets students use Google / Apple / Microsoft**, and **fits SWA Easy Auth**. Do **not** pick the option that is merely fewest new Azure resources if it lets a student principal open `/studio`.

### Options evaluated

| Option | What it is | Daily UX | Isolation | Config burden | Verdict |
|--------|------------|----------|-----------|---------------|---------|
| **A. Workforce guests** | Invite every student as an Entra guest on `elyse-portfolio-*`. Same AAD app as Studio | Students hit the Microsoft work login. Mixed with operators | **None.** Students become directory objects next to Elyse. `/studio` is already `authenticated` | Low | **Reject** — collides with Studio authz, Assignment-required rules, and “any tenant member can sign in” |
| **B. Entra External ID (CIAM) + SWA custom OIDC** | Separate **external** tenant. User flow federates **Google**, **Apple**, and **Microsoft personal (MSA)** via [External ID IdPs](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers). SWA `customOpenIdConnectProviders` (e.g. `contact`) points at that tenant. Workforce `azureActiveDirectory` stays as today | Site **Sign in** → External ID page with the three buttons (or `domain_hint` for a direct Google/Apple/Microsoft hop). Studio **Sign in** stays `/.auth/login/aad` | Strong. Students never exist in the teaching tenant | Medium (new tenant, two app registrations for staging/prod, three social apps) | **Select** |
| **C. SWA-native Google + Apple + extra OIDC for MSA** | `identityProviders.google` / `.apple` plus a custom OIDC to `login.microsoftonline.com/consumers`. Keep current AAD for Studio | First-class buttons on-site (`/.auth/login/google` etc.) | OK if `rolesSource` is perfect | Apple **client secret JWT expires ≤6 months** in SWA settings; three SWA providers; **no** cross-provider account link except what we build | Reject as **primary** — linking + Apple secret rotation + MSA are what CIAM already does. Revisit only if External ID is blocked |
| **D. App-issued cookies (bypass Easy Auth)** | Own OAuth + JWT | Full control | Strong if coded well | High (session, CSRF, refresh) | **Reject** — second auth stack next to SWA |
| **E. Auth0 / Clerk / Firebase** | Hosted CIAM vendor | Friendly | Extra vendor, extra bill | Low–medium | **Reject** — we already pay for SWA Standard + Entra |

### Selected architecture (B)

SWA already uses a **custom** AAD registration (not the shared preconfigured providers). Adding a custom OIDC provider for External ID is the documented Standard-plan pattern ([custom authentication](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-custom)).

**SWA roles (Phase 1):** `rolesSource` (`POST /api/authRoles`, name TBD) assigns:

| Principal | SWA role | Routes |
|-----------|----------|--------|
| Workforce AAD (`azureActiveDirectory`, teaching tenant issuer) | `studio` | `/studio`, `/studio/*` — **replace** today’s `authenticated` so a contact login cannot open Studio chrome |
| External ID (custom OIDC `contact`) | `contact` | `/account`, `/account/*`. Slot-**book** APIs when the flag is on |
| Either | built-in `authenticated` | Not sufficient for `/studio` after P1 |

Issuer (or SWA `identityProvider` id) decides the role — **not** `studioUsers` and **not** the permission catalog. The monitor account (`TEST-C-005`) is workforce AAD, so it still receives `studio` and can open `/studio/health` with zero catalog grants.

**Global 401 today** redirects to `/.auth/login/aad?post_login_redirect_uri=/studio`. That is wrong for contact routes. Phase 1 sends 401 to a public **`/login`** chooser:

- Continue to Studio → `/.auth/login/aad` (operators)
- Book or manage account → `/.auth/login/contact` (students / parents)

Do **not** lock `/lessons/book` behind `allowedRoles`. Anonymous visitors always read rates and **always** can submit the lesson inquiry. When the flag is on, **see schedule** / **book a slot** send them through `/login` then back.

**Secrets (names only in git):** External ID client id/secret per env, Google iOS/web client for federation, Apple Services ID + key material, MSA OIDC client secret. Env Key Vault + `lifecycle { ignore_changes }`. Never echo. Apple and Google clients used here are **not** the Calendar OAuth clients (`STUDIO-P3-001`).

**Cost:** External ID **core is $0 through 50,000 MAU** per linked subscription ([pricing](https://learn.microsoft.com/en-us/entra/external-id/external-identities-pricing)). Volume here is tens of students. **Apple Developer Program** is **~$99/year**, non-Azure — required for Sign in with Apple; list it under non-Azure in `cost-and-quotas.md` when P1 ships. No new Azure SKU is expected; if Terraform adds one, recalc expected + `ceil(expected × 1.25)` budget in that PR.

**Local Functions:** `AZURE_FUNCTIONS_ENVIRONMENT=Development` may impersonate a contact principal for `/api/account` the same way it grants the Studio catalog today — document the header/fixture; do not point `astro dev` at production External ID.

---

## Feature flag

Same CD constraint as payments: **one Astro artifact** for staging and prod, so the flag is a **runtime SWA app setting**, not a baked `PUBLIC_*` value.

| | |
|--|--|
| Terraform | `contact_accounts_enabled` (env stacks) |
| SWA setting | `CONTACT_ACCOUNTS_ENABLED` (`true` / `false`) |
| Public read | Anonymous GET (new `/api/contactAccountConfig` **or** a field on an existing public config — pick in the PR). `{ enabled: boolean }` only — no secrets, no PII |
| Staging default | **true** (exercise login, schedule, history) |
| Production default | **false** until go-live (`terraform apply -var='contact_accounts_enabled=true'`) |
| Independent of | `LESSON_PAYMENTS_ENABLED` — pay CTAs and contact accounts turn on separately |

**Do not reuse** the payments flag. Calendar/Studio scheduling already follows `LESSON_PAYMENTS_ENABLED`; student-facing account chrome is a different go-live.

| Surface | Flag **off** | Flag **on** |
|---------|--------------|-------------|
| Lesson inquire (`type=lesson`) | Works (Turnstile, anonymous) | **Still works** (Turnstile, anonymous) |
| Casting inquire | Works | Works |
| Rates + Payment Links | Public (pay has its own flag) | Public |
| Sign in / Account in public header | Hidden | Shown |
| `/account` (profile, preferences, **history**) | Not advertised; hit → redirect to `/lessons/book` or a short “not available” | Shown; requires `contact` session |
| Free/busy schedule + **book a slot** | Hidden | Requires `contact` session; anonymous → `/login` then back |
| Slot-create API | 404 or 403 | `contact` role + linked `contactId` |

Local: `CONTACT_ACCOUNTS_ENABLED=true` in Functions settings (and the public config GET). Document next to `LESSON_PAYMENTS_ENABLED` in rotate-secrets / setup when the flag ships.

---

## Contact link rules

People (`contacts`, partition `people`) remains the person. Login is a **key** on that person.

| Event | Behavior |
|-------|----------|
| First login, IdP email **verified**, matches one **active** contact `emailKey` | Attach identity (`provider`, `issuer`, `subject`). Do not create a second row |
| First login, no email match | Create a contact: `displayName` from token, `email` from verified claim, persona `student` (or `parent` if they pick that on first-run). Inquiry ingest (`STUDIO-P4-001`) already upserts on email — this path must use the same uniqueness rules |
| Apple **Hide My Email** (`privaterelay.appleid.com`) | Do **not** guess a “real” address. Store the relay as `email` if nothing else exists; `/account` asks for the address they use for lessons (unique among active rows). ACS **Requested** / **Confirmed** goes to the lesson email they confirm, not only the relay |
| Same person later uses a second provider (Google then Apple) | If verified emails match the same contact, attach a second identity. If they do not match, do **not** auto-merge — operator links in People |
| Two active contacts share the email (should not happen) | Do not attach. Log kind + ids. Surface in Studio as “needs a person” (same spirit as unmatched Stripe) |
| Operator archives the contact | Login still authenticates, but account APIs 403 until an operator restores or re-links. Do not silently create a duplicate |
| Studio operator who also takes lessons | They use **External ID** for `/account` / booking, **workforce AAD** for `/studio`. Never treat a `studio` role as a contact session |

**Parents:** Profile can set persona `parent` (and keep `student` if they also take lessons). Booking for a **linked** student is Phase 4. Until then, the signed-in contact is the lesson `contactId`.

**Self-serve vs operator fields** — see next section. Students never edit notes, LTV, rate, package remaining, agent/casting fields, or archive flags.

---

## Self-serve profile and preferences

`/account` is public-site chrome (`noIndex`, not in sitemap, `private, no-store`). It is **not** a Studio tab.

| Group | Fields the contact may edit | Notes |
|-------|-----------------------------|-------|
| **Profile** | `displayName`, `email`, `phone` | Email change must stay unique among active contacts; re-match Stripe unmatched rows using existing CRM behavior |
| **Preferences** | `studentFormat` (`nyc` \| `zoom`), `studentSmsOk`, `timezone` | Timezone default remains `America/New_York` until they override (`STUDIO-P4-003` already allows a contact override conceptually — persist it here) |
| **Role in the studio** | `student` and/or `parent` persona flags **only** | Cannot add `agent` / `casting` / `alumni` |
| **History (read-only)** | Upcoming and past lessons for this contact | Status labels match Studio (**Requested** / **Confirmed** / declined / cancelled). No operator notes, no other students. `ACCOUNT-P4-001` |

**Not on `/account`:** operator notes, student rate, package remaining, LTV, related-contact graph (except Phase 4 parent→student), archive.

Header on public pages (iPhone), **only when the flag is on:** **Sign in** → `/login` (contact audience) or **Account** when a `contact` session exists. Do not put **Studio** in the public header. When the flag is off, no student Sign in chrome.

---

## Schedule, booking, and inquiry

Aligns with [`studio-teaching-business.md`](./studio-teaching-business.md) lifecycle (`requested` → `confirmed` when Elyse accepts).

**Always (flag on or off):**

1. Visitor reads `/lessons/book` anonymously (rates, voice-only copy, Payment Links if that flag is on).
2. **Lesson inquiry** (`InquiryForm` `type=lesson`) and **casting inquiry** submit via Turnstile with **no login**. Same `STUDIO-P4-001` CRM upsert on email. This path does **not** create a booked slot.

**Only when `CONTACT_ACCOUNTS_ENABLED` is on:**

3. **See the schedule** (free/busy picker, `STUDIO-P5-001`) and **book a slot** require a `contact` session. If anonymous → `/login` → back to book.
4. Create-lesson API uses the **linked `contactId`**. Ignore any contact id in the body.
5. Persist `requested` **before** Google (`STUDIO-P3-003` / `P3-006`). ACS **Requested** to the contact email.
6. `/account` shows **history** of that contact’s lessons (`ACCOUNT-P4-001`).

`STUDIO-P5-001` must **not** ship an anonymous free/busy book POST. Hide the picker when the contact-accounts flag is off (inquire remains). That ID’s ACs depend on `ACCOUNT-P3`.

---

## Phased backlog

### Phase 0 — Plan + systems of record

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `ACCOUNT-P0-001` | Contact-account plan: identity split, link rules, Action IDs | `done` | — | `docs/plans/contact-accounts.md`, `studio-teaching-business.md`, `AGENTS.md`, `README.md` |

<details>
<summary><code>ACCOUNT-P0-001</code> — Plan as backlog SoT</summary>

**Acceptance criteria**

- [x] North star: flag-gated `/account` (profile, preferences, **history**) + see schedule / book a slot; Google / Apple / Microsoft; Studio stays operator-only
- [x] **Inquiry (`type=lesson` and `type=casting`) never requires login**, flag on or off
- [x] Feature flag `CONTACT_ACCOUNTS_ENABLED` (independent of payments); staging true / prod false until go-live
- [x] Identity choice: Entra External ID + SWA custom OIDC; workforce Entra unchanged; `rolesSource` `studio` vs `contact`
- [x] Contact row remains person SoT; login links by verified email; Apple Hide My Email called out
- [x] Discrete phases `ACCOUNT-P1`–`P4` with Action IDs and unchecked ACs
- [x] Studio plan public-booking / out-of-scope / `STUDIO-P5-001` dependency updated in the same change
- [x] `AGENTS.md` + README point at this plan (`ACCOUNT-*`)

</details>

---

### Phase 1 — Student identity

**Goal:** A student can complete Google, Apple, or Microsoft sign-in and receive the `contact` SWA role. An operator completing workforce AAD still receives `studio`. Students cannot open `/studio`.

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `ACCOUNT-P1-001` | External ID tenant + SWA OIDC + KV placeholders | `planned` | `ACCOUNT-P0-001` | `infra/` (bootstrap vs env — **never env → bootstrap**); env vault names; `staticwebapp.config.json` |
| `ACCOUNT-P1-002` | `rolesSource` + `/studio` requires `studio` | `planned` | `ACCOUNT-P1-001` | `api/src/functions/` auth-roles; SWA routes; [`authentication-authorization.md`](../architecture/authentication-authorization.md) |
| `ACCOUNT-P1-003` | Public `/login` chooser; fix 401 override | `planned` | `ACCOUNT-P1-002` | `src/pages/login.astro`; `staticwebapp.config.json` `responseOverrides` |
| `ACCOUNT-P1-004` | Federate Google, Apple, Microsoft on the user flow | `planned` | `ACCOUNT-P1-001` | Operator runbook; IdP apps (not Calendar clients) |
| `ACCOUNT-P1-005` | Auth runbook, secret names, privacy mention, cost note | `planned` | `ACCOUNT-P1-004` | `docs/runbooks/`; `rotate-secrets.md`; `privacy.astro`; `cost-and-quotas.md` |
| `ACCOUNT-P1-006` | `CONTACT_ACCOUNTS_ENABLED` Terraform + SWA + public config GET | `planned` | `ACCOUNT-P1-001` | env `variables.tf`; SWA app settings; anonymous config API |

<details>
<summary><code>ACCOUNT-P1-001</code> — External ID + SWA</summary>

**Acceptance criteria**

- [ ] One **external** Entra tenant (CIAM), not the workforce teaching tenant. Staging and prod are **app registrations** (redirect URIs per SWA host), not two CIAM tenants unless product limits force it
- [ ] SWA `customOpenIdConnectProviders` (e.g. `contact`) + existing `azureActiveDirectory`. Login URLs: `/.auth/login/contact` vs `/.auth/login/aad`
- [ ] KV placeholders + `lifecycle { ignore_changes }` for client secrets. Names only in git. [`.cursor/rules/never-echo-secrets.mdc`](../../.cursor/rules/never-echo-secrets.mdc)
- [ ] Terraform stack direction: shared tenant/app scaffolding may live in **bootstrap**; env stacks consume well-known names. No `terraform_remote_state` of staging/prod into bootstrap
- [ ] If any new billable Azure SKU appears: `cost-and-quotas.md` + `budget.tf` + `SUBSCRIPTION_BUDGET_USD` in the **same** PR
- [ ] GitHub is still 404 at `/.auth/login/github`

</details>

<details>
<summary><code>ACCOUNT-P1-002</code> — Roles</summary>

**Acceptance criteria**

- [ ] `rolesSource` Function assigns `studio` iff the principal is workforce AAD; `contact` iff External ID. Never both. Never use the permission catalog here
- [ ] `/studio` and `/studio/*` `allowedRoles`: `["studio"]` (not `authenticated`)
- [ ] Monitor user still reaches `/studio/health` (workforce AAD → `studio`, no profile)
- [ ] Contact principal calling `GET /api/contacts` (list) still 403 — `permissionGate(people.read)` unchanged
- [ ] Architecture SoT + [`manage-access.md`](../runbooks/manage-access.md) + [`.cursor/rules/studio-auth.mdc`](../../.cursor/rules/studio-auth.mdc) updated in this PR
- [ ] Logs: provider kind + `correlationId` only — no tokens or emails

</details>

<details>
<summary><code>ACCOUNT-P1-003</code> — Login chooser</summary>

**Acceptance criteria**

- [ ] Public `/login` (indexable? **no** — `noIndex`; not in sitemap). Copy: two paths, voice-lessons tone, no Studio jargon on the student button
- [ ] SWA 401 override → `/login` (honor `post_login_redirect_uri` / query so Studio deep links still return to `/studio/...`)
- [ ] Student button uses External ID (optional `domain_hint` later). Operator button uses AAD
- [ ] iPhone Safari: complete Google, Apple, and Microsoft round-trips on staging

</details>

<details>
<summary><code>ACCOUNT-P1-004</code> — Social IdPs</summary>

**Acceptance criteria**

- [ ] External ID user flow enables **Google**, **Apple**, and **Microsoft personal** (MSA as custom OIDC to the consumers endpoint per current External ID docs — not workforce `AzureADMyOrg`)
- [ ] Google OAuth client is **not** the Calendar organizer/Elyse client. Redirects include External ID federation URIs ([Google federation](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-google-federation-customers))
- [ ] Apple: Services ID + Sign in with Apple; Hide My Email must not 500 the callback
- [ ] No local email+password on v1 (social only). Email OTP is out of scope unless social is blocked
- [ ] Operator residual checklist in the runbook: Apple Developer Program enrollment, Google consent screen, MSA app

</details>

<details>
<summary><code>ACCOUNT-P1-005</code> — Docs and cost</summary>

**Acceptance criteria**

- [ ] Runbook: how operators vs students sign in, how to add a test user, what to do if External ID is down (booking disabled, rates + casting inquire still up)
- [ ] `rotate-secrets.md` lists new secret **names**
- [ ] Privacy policy names student/parent **sign-in** and which providers (no sample PII)
- [ ] `cost-and-quotas.md`: External ID MAU $0 at expected volume; Apple Developer on the **non-Azure** table; no silent “negligible” if a meter appears
- [ ] Smoke: unauthenticated `/studio` still redirects; contact login cannot render Studio home

</details>

<details>
<summary><code>ACCOUNT-P1-006</code> — Feature flag</summary>

**Acceptance criteria**

- [ ] Terraform `contact_accounts_enabled` → SWA `CONTACT_ACCOUNTS_ENABLED` (string `true`/`false`). Staging default **true**, prod default **false**
- [ ] Not the same variable as `lesson_payments_enabled`
- [ ] Anonymous public GET returns `{ enabled }` only — no tokens, emails, or contact ids. Same one-artifact rule as `GET /api/lessonPayConfig` (not baked `PUBLIC_*`)
- [ ] Flag **off**: public header has no student Sign in; `/account` and schedule/book UI hidden; **lesson inquire still submits**
- [ ] Flag **on**: Sign in / Account, `/account`, schedule + book surfaces appear (still require `contact` session for those actions)
- [ ] Go-live documented: `terraform apply -var='contact_accounts_enabled=true'` in prod after identity is verified on staging
- [ ] [`rotate-secrets.md`](../runbooks/rotate-secrets.md) / setup mention the flag (it is not a secret)

</details>

---

### Phase 2 — Link login to People + `/account`

**Goal:** After sign-in, the student has a People row and can edit profile + preferences on `/account`.

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `ACCOUNT-P2-001` | Identity ↔ contact store + first-login link/create | `planned` | `ACCOUNT-P1-002`; `STUDIO-P1-001` | `api/src/lib/contacts.js` (or `contactIdentities`); `data-persistence.md` |
| `ACCOUNT-P2-002` | `GET`/`PATCH /api/account` (own row, allowlisted fields) | `planned` | `ACCOUNT-P2-001` | `api/src/functions/`; contact gate (not `people.write`) |
| `ACCOUNT-P2-003` | `/account` UI (profile + preferences) | `planned` | `ACCOUNT-P2-002` | `src/pages/account/`; public header Sign in / Account |
| `ACCOUNT-P2-004` | Privacy, logging, journeys | `planned` | `ACCOUNT-P2-003` | `privacy.astro`; `tests/journeys/` |

<details>
<summary><code>ACCOUNT-P2-001</code> — Link</summary>

**Acceptance criteria**

- [ ] Persist provider + issuer + subject → `contactId` on the existing CRM account (new table **or** columns on `contacts` — pick one in the PR and document in [`data-persistence.md`](../architecture/data-persistence.md))
- [ ] First login follows [Contact link rules](#contact-link-rules) (match, create, Apple relay, no auto-merge)
- [ ] Duplicate active emails still forbidden
- [ ] Same uniqueness as `STUDIO-P4-001` inquiry upsert (one person per email)
- [ ] No new Postgres SKU

</details>

<details>
<summary><code>ACCOUNT-P2-002</code> — Account API</summary>

**Acceptance criteria**

- [ ] Requires `contact` SWA role + linked contact. 401/403 + `correlationId` otherwise
- [ ] PATCH allowlist: display name, email, phone, `studentFormat`, `studentSmsOk`, `timezone`, student/parent persona flags only
- [ ] Reject notes, LTV, rate, package, agent/casting, `archived`, arbitrary `relatedContacts`, other `contactId`s
- [ ] Studio `people.write` still edits the same row from `/studio/people` (operators win on those fields; optimistic concurrency via etag)
- [ ] Development environment can call the API without External ID (documented fixture)

</details>

<details>
<summary><code>ACCOUNT-P2-003</code> — Account UI</summary>

**Acceptance criteria**

- [ ] `/account` is SWA `contact`-gated (or page-level redirect to `/login`) **and** hidden when `CONTACT_ACCOUNTS_ENABLED` is false, `noIndex`, not in sitemap, `private, no-store`
- [ ] iPhone Safari: edit profile + preferences, save, friendly error + `Reference: {correlationId}`
- [ ] Public header Sign in / Account **only when the flag is on** (not Studio)
- [ ] First-run: choose student vs parent if personas are empty

</details>

<details>
<summary><code>ACCOUNT-P2-004</code> — Privacy + tests</summary>

**Acceptance criteria**

- [ ] Privacy covers account profile, preferences, SMS-ok, and identity providers
- [ ] Function logs: kinds + contact id only
- [ ] Journey: anonymous `/account` → login; signed-in contact can save preferences (staging)

</details>

---

### Phase 3 — Flag-gated schedule and booking

**Goal:** When the flag is on, **seeing the schedule and booking a slot** require a contact session. **Lesson inquiry never requires login.** Rates, pay links, and casting inquire stay public.

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `ACCOUNT-P3-001` | Gate **schedule + book a slot** on flag + `contact` session | `planned` | `ACCOUNT-P1-006`; `ACCOUNT-P2-001` | `/lessons/book`; slot-create API |
| `ACCOUNT-P3-002` | Bind `contactId` from the session on book | `planned` | `ACCOUNT-P3-001`; `STUDIO-P3-003` | `api/src/functions/lessons.js` (or public book function) |
| `ACCOUNT-P3-003` | Keep **lesson + casting inquire**, rates, pay links anonymous | `planned` | `ACCOUNT-P3-001` | `InquiryForm`; `contactInquiry`; `lessonPayConfig` |
| `ACCOUNT-P3-004` | Book journeys + Studio plan AC sync | `planned` | `ACCOUNT-P3-002` | `tests/journeys/lessons.spec.ts`; `STUDIO-P5-001` |

<details>
<summary><code>ACCOUNT-P3-001</code> — Gate</summary>

**Acceptance criteria**

- [ ] Flag **off**: no schedule picker, no book-slot CTA, no student Sign in; **lesson inquire still works**
- [ ] Flag **on**: anonymous visitors see rates, inquire, and Payment Links; **See schedule** / **Book** require login
- [ ] Unauthenticated slot-create API → 401 (flag on) or 404 (flag off), not a 500
- [ ] Do **not** retire Turnstile lesson inquire. That form must not require a session

</details>

<details>
<summary><code>ACCOUNT-P3-002</code> — Bind contact</summary>

**Acceptance criteria**

- [ ] Booked-slot lesson row `contactId` = linked contact. Body `contactId` ignored
- [ ] Same persist-then-Google path; **Requested** mail to the account email
- [ ] Rate-limit still applies (login is not a substitute for abuse controls)
- [ ] `STUDIO-P5-001` slot picker uses this same bind — no anonymous book POST; picker hidden when the contact-accounts flag is off

</details>

<details>
<summary><code>ACCOUNT-P3-003</code> — Always-on inquire</summary>

**Acceptance criteria**

- [ ] `type=lesson` inquire unchanged: Turnstile, anonymous, upserts CRM (`STUDIO-P4-001`) — **does not** require the flag or a contact session
- [ ] `type=casting` inquire unchanged
- [ ] `GET /api/lessonPayConfig` still anonymous
- [ ] Stripe Payment Links do not require a contact session
- [ ] Journey: submit a lesson inquiry while logged out, flag on and flag off

</details>

<details>
<summary><code>ACCOUNT-P3-004</code> — Tests</summary>

**Acceptance criteria**

- [ ] `LESSON-*` journeys: anonymous book page still renders inquire; schedule/book appear only when flag on + signed in
- [ ] No PII in test fixtures beyond already-fictional staging people

</details>

---

### Phase 4 — Lesson history and parent booking

**Goal:** `/account` is where signed-in students **see their history** (upcoming and past lessons). A parent can later book a slot for a linked student. History should ship before production turns the flag on.

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `ACCOUNT-P4-001` | `/account` lesson **history** (own `contactId` only) | `planned` | `ACCOUNT-P2-001`; `STUDIO-P3-003` | `/account`; lessons list API scoped to self |
| `ACCOUNT-P4-002` | Parent books a slot for a related student | `planned` | `ACCOUNT-P4-001`; `ACCOUNT-P3-002`; `STUDIO-P1-002` | Book UI + bind rules |
| `ACCOUNT-P4-003` | Help / book copy for account holders | `planned` | `ACCOUNT-P1-006` | `/lessons/book` copy |

<details>
<summary><code>ACCOUNT-P4-001</code> — History</summary>

**Acceptance criteria**

- [ ] `/account` lists upcoming and past lessons for the linked contact only (Studio-created and slot-booked)
- [ ] Status labels match Studio: **Requested** / **Confirmed** / declined / cancelled
- [ ] Empty state when they have no lessons yet
- [ ] No other students’ rows; no operator notes; no LTV
- [ ] Hidden when `CONTACT_ACCOUNTS_ENABLED` is false (same as the rest of `/account`)

</details>

<details>
<summary><code>ACCOUNT-P4-002</code> — Parents</summary>

**Acceptance criteria**

- [ ] Parent persona + `relatedContacts` student link required to book as someone else
- [ ] Cannot bind an arbitrary `contactId`
- [ ] ACS mail goes to the parent (and student email if present) per existing comms rules — never `ALERT-*`

</details>

<details>
<summary><code>ACCOUNT-P4-003</code> — Copy</summary>

**Acceptance criteria**

- [ ] `/lessons/book` explains: inquire anytime without an account; **sign in to see the schedule, book a slot, and view history** — only when the flag is on (voice-lessons only)
- [ ] Do not document unshipped slot picker or Studio screens on the public account page

</details>

---

## Dependency graph

```text
ACCOUNT-P0-001 (done)
    └─► ACCOUNT-P1-001 External ID + SWA OIDC
            ├─► P1-002 rolesSource + /studio = studio role
            │         └─► P1-003 /login chooser + 401 override
            ├─► P1-004 Google / Apple / Microsoft federation
            ├─► P1-005 runbook + privacy + cost
            └─► P1-006 CONTACT_ACCOUNTS_ENABLED flag
                    └─► ACCOUNT-P2-001 identity ↔ contact
                              ├─► P2-002 /api/account
                              │         └─► P2-003 /account UI ─► P2-004 privacy/tests
                              ├─► ACCOUNT-P4-001 history on /account
                              └─► ACCOUNT-P3-001 gate schedule+book (flag on)
                                        └─► P3-002 bind contactId ─► P3-003 inquire always anonymous
                                                  └─► P3-004 journeys
                                                            ├─► P4-002 parent book
                                                            └─► STUDIO-P5-001 public slot picker (flag on)
STUDIO-P1-001 contacts (done) ─► P2-001 link
STUDIO-P3-003 lesson workflow (done) ─► P3-002 bind; P4-001 history
```

---

## Out of scope

| Item | Why |
|------|-----|
| Students in the workforce Entra tenant | Mixes operators and contacts; breaks the Studio login story |
| Student chrome on `/studio` | Studio is ops; `/account` is the contact surface |
| Full student-portal SaaS (homework, video library, multi-teacher payroll) | Thin account + book only; reopen if asked |
| Local email+password / magic-link as v1 | User asked for Google, Apple, or Microsoft |
| Auth0, Clerk, Firebase Auth, Azure AD B2C (legacy) | External ID is the current Microsoft CIAM |
| Forcing Google Calendar login to book | Calendar option F already invites the student by email; account IdP is independent |
| Forcing login to **inquire** | Potential clients must always reach Elyse via the form |
| Casting-director accounts | Inquire stays anonymous |
| Payment Links requiring login | Money UX stays a shareable link ([`lesson-payments.md`](./lesson-payments.md)) |
| Reusing `LESSON_PAYMENTS_ENABLED` for accounts | Separate go-live; pay CTAs ≠ student schedule chrome |
| `people.write` for students | Own-row allowlist only |
| Marketing lists / `ALERT-*` to students | Unchanged privacy rules |
| Entra External ID premium add-ons (SMS MFA, etc.) | Not needed at this volume |
| `OPS-P3-002` PagerDuty | Unrelated |

---

## Related

| Doc | Role |
|-----|------|
| [`studio-teaching-business.md`](./studio-teaching-business.md) | Ops SoT; `STUDIO-P5-001` waits on `ACCOUNT-P3` + flag; inquire stays anonymous |
| [`lesson-payments.md`](./lesson-payments.md) | Pay stays no-account; its flag is independent of `CONTACT_ACCOUNTS_ENABLED` |
| [`authentication-authorization.md`](../architecture/authentication-authorization.md) | Update in the `ACCOUNT-P1-002` PR when roles/gates ship |
| [`data-persistence.md`](../architecture/data-persistence.md) | Update in the `ACCOUNT-P2-001` PR when identity link ships |
| [`manage-access.md`](../runbooks/manage-access.md) | Operators vs contacts after P1 |
| [`cost-and-quotas.md`](../runbooks/cost-and-quotas.md) | External ID MAU + Apple Developer when P1 ships |
| [`ux-release-testing-strategy.md`](./ux-release-testing-strategy.md) | New journeys under `ACCOUNT-P2-004` / `P3-004` |
| [`.cursor/rules/studio-auth.mdc`](../../.cursor/rules/studio-auth.mdc) | Extend in P1: `contact` role ≠ catalog |
