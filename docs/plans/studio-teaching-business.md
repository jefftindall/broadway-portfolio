# Plan: Studio as teaching-business ops

**Artifact ID:** `ELYSE-STUDIO-001`  
**Version:** 1.4  
**Last updated:** 2026-08-23  
**Audience:** Agents, implementers, operators  
**Scope:** Auth-gated Studio (`/studio`) as the ops home for the teaching business **and** career relationships — CRM (people + personas + LTV), Google Calendar scheduling, contact automation, payment status, and reports. Public site stays the portfolio + inquire/book surface. Money movement stays in [`lesson-payments.md`](./lesson-payments.md).

Use the **Action ID** column (`STUDIO-*`) to reference items in PRs, issues, and commits.

Example PR title: `STUDIO-P1-003: Add /studio/people contact list`

**Status values:** `planned` · `in_progress` · `blocked` · `done` · `wont_fix`

**Implementation stance:** This document is the backlog. Prefer **one phase (or one `STUDIO-*` item) per PR**. Phase 0 (this plan) is done. Do **not** buy HubSpot, HoneyBook, or My Music Staff as the relationship system of record — Studio owns people. Do **not** rebuild Stripe as a bank.

---

## North star

**Studio** (`/studio` and `/studio/*`) is the login-protected workspace for running the teaching business **and** managing relationships with students and agents — not only a content publisher. It is the place to operate lessons and career follow-up: people, schedule, payment status, communications, and financial visibility — while the public site stays the portfolio + inquire/book surface.

### Systems of record

Record shapes, Table Storage keys, git collections, and access-flow diagrams: [`docs/architecture/data-persistence.md`](../architecture/data-persistence.md) (living SoT — update it in the same PR when CRM, profiles, or other stores change).

| Concern | System of record | Studio’s job |
|---------|------------------|--------------|
| **Relationships** | Studio CRM (`/studio/people`) | Create, edit, persona tags, notes, LTV display |
| **Time / availability** | **Google Calendar** (Elyse’s calendars) | Read busy time; write confirmed lessons; never fork a second calendar |
| **Money** | **Stripe** (Dashboard / Payment Links / webhooks) | Show paid/unpaid and student LTV; do not invoice or charge here |
| **Public brand** | Astro site (`/lessons/book`, inquire forms) | Later: offer free slots that already exist on Google Calendar |

### Non-negotiables

| Rule | Meaning |
|------|---------|
| **Auth-gated** | SWA `authenticated` on `/studio` and `/studio/*`; never public nav or sitemap. Entra Assignment required stays **off** so tenant users can sign in; APIs still authorize every call (`permissionGate` against the catalog — not login, not a separate publish allowlist) |
| **Personalized** | UI and data scoped by the signed-in user’s **permissions**. Publish and People share one catalog; profiles are SoT |
| **Teaching-first** | Voice lessons only (pedagogy, vocal health, CCM)—no acting-lesson ops or marketing |
| **One home for ops** | Deepen Studio rather than scattering people/schedule/pay/comms across SaaS CRMs. Stripe stays money; Google Calendar stays time |
| **No PII in git** | Student/agent names, emails, phones, notes, and tokens never land in the repo, scorecards, or PR bodies |

### Today vs later

| Area | Today (in scope now) | Later (phased `STUDIO-*` below) |
|------|----------------------|----------------------------------|
| Content | Voice/text → Gemini → site publish | Keep; still part of running the brand |
| People / CRM | `/studio/people` list + detail (`STUDIO-P1`) | LTV + Stripe match (`STUDIO-P2`) |
| Schedule | Email / manual | Google Calendar sync, availability, write-back (`STUDIO-P3`) |
| Payments | Not in Studio (Stripe Dashboard / Payment Links when adopted) | Who is paid / unpaid per lesson; share pay links (`STUDIO-P2`) |
| Communications | Inquiry forms → email (ACS notify) | Templates, reminders, inquiry → CRM (`STUDIO-P4`) |
| Financial reports | — | Month summary (gross / fees / net / refunds); deep ledger stays in Stripe/exports (`STUDIO-P5`) |
| Public booking | Inquire-then-email | Optional slot picker that reads Google free/busy (`STUDIO-P5`) |
| Help | `/studio/help` capability catalog | Expand as ops capabilities ship (never before) |
| Access | Roles + discrete permissions (`STUDIO-P6`) | Grant People without publish (and the reverse) |

Payments vendor choice and Phase 1 checkout live in [`lesson-payments.md`](./lesson-payments.md). That plan’s Studio section should stay aligned with this north star.

---

## Status at a glance

| Phase / area | Status | Open residuals |
|--------------|--------|----------------|
| Phase 0 — Plan + Action IDs + SoT | `done` | — |
| Phase 1 — People & personas | `done` | Residual: `STUDIO-P1-006` async export |
| Phase 6 — Roles, permissions, user profiles | `done` | Allowlist bootstraps Owner on first session; live grants on `/studio/access` |
| Phase 2 — Lifetime value + pay status | `planned` | Stripe match + agent value |
| Phase 3 — Google Calendar scheduling | `planned` | OAuth + two-way sync |
| Phase 4 — Contact automation | `planned` | Inquiry ingest + reminders |
| Phase 5 — Public slots + month report | `planned` | After P3 write-back is reliable |

**Suggested next:** `STUDIO-P2-001` (student LTV from Stripe email match) after staging CRM apply + Payment Links are usable.

---

## How to use this document

| Section | Purpose |
|---------|---------|
| [North star](#north-star) | SoT rules and today vs later |
| [Status at a glance](#status-at-a-glance) | Done vs not done |
| [Personas](#personas) | Student / agent / parent / casting / alumni |
| [Product pillars](#product-pillars-future-studio) | UI map |
| [Phased backlog](#phased-backlog) | Implementable `STUDIO-*` work |
| [Out of scope](#out-of-scope) | Explicit non-goals |

---

## Personas

A **person** is one contact. A person may have **one or more personas**. Do not force everyone into “client” or “deal.”

| Persona | Who | LTV model | Typical automations (Phase 4) |
|---------|-----|-----------|-------------------------------|
| `student` | Voice-lesson client | **Monetary** — Stripe charges + offline Venmo/cash | Confirmations, lesson reminders, package remaining |
| `parent` | Payer or scheduler for a student | Tied to the linked student’s monetary LTV | Pay-link share, reminders (not a second lesson SMS blast) |
| `agent` | Talent representation | **Career value** — last submission, last booking, recency, warmth. Not a fake invoice total | Operator follow-up task when stale; no lesson SMS |
| `casting` | Casting director / office | Relationship + last materials request. Not tuition | Inquiry logged; no marketing sequences |
| `alumni` | Past student | Historical monetary LTV | Optional re-engage — **opt-in only**, never default-on |

**Related contacts:** student ↔ parent; Elyse ↔ agent ↔ agency (agency as a note or company field, not a second CRM product).

Lesson inquiry (`type=lesson` on [`InquiryForm`](../../src/components/InquiryForm.astro)) seeds `student` (or `parent` if the form later says so). Casting inquiry (`type=casting`) seeds `casting`. Agents are created in Studio, not guessed from a casting form.

---

## Product pillars (future Studio)

```text
┌──────────────────────────────────────────────────────────────────┐
│ Studio (authenticated · personalized)                            │
├────────────┬────────────┬────────────┬────────────┬──────────────┤
│ People     │ Schedule   │ Payments   │ Comms      │ Reports      │
│ personas   │ GCal sync  │ paid/unpaid│ reminders  │ month summary│
│ LTV        │ availability│ pay links │ confirm    │ fees / net   │
│ notes      │ write-back │ packages  │ inquiry in │ export link  │
├────────────┴────────────┴────────────┴────────────┴──────────────┤
│ Content publish (existing Gemini tools) · Help                   │
└──────────────────────────────────────────────────────────────────┘
         │                         │                    │
         ▼                         ▼                    ▼
   Public site              Google Calendar         Stripe (money)
   /lessons/book            busy + events           Dashboard / APIs
```

### Payment-related Studio functions (when payments ship)

**Do in Studio (ops):** see who paid for upcoming lessons; copy/share Payment Links; sync rates with live prices; light month summary; log offline Venmo/cash with the same student/lesson record.

**Leave in Stripe (money):** disputes, payouts, tax forms, full Balance CSV, Tap to Pay hardware, payment-method configuration.

Do not invent Gemini tools that silently charge a card from free-form speech without an explicit confirm UI.

---

## Design constraints

1. **Personalized, not multi-tenant SaaS UI** — One coach’s business. Authorized operators share the studio People partition (`crmOwnerKey`); unsigned capabilities stay hidden. Do not invent a second CRM per signed-in user unless an Access profile sets a different owner key.
2. **Mobile-first (iPhone 17 · Safari)** — Day-of pay status, “copy link,” and “who is next” must work on the phone.
3. **Correlation / friendly errors** — Same Studio API contract (`httpErrors` + `correlationId`); never raw Stripe or Google API errors in the UI.
4. **Content tools stay** — Rate and policy updates via Gemini remain valid; ops screens complement them, they don’t replace `/lessons` brand rules.
5. **No fake features in help** — `/studio/help` and `studioHelp.ts` only document shipped capabilities.
6. **Cheap store first** — Start with **Azure Table Storage** (or Cosmos serverless) so hosting stays cents-to-a-few-dollars. Do **not** add PostgreSQL Flexible Server until queries need it. Adding a billable SKU must update [`cost-and-quotas.md`](../runbooks/cost-and-quotas.md) and the subscription budget in the **same** infra PR.
7. **Calendar is Google’s** — Availability is free/busy on Elyse’s Google calendars. Studio never becomes a competing calendar that can drift.
8. **Automation is transactional** — Confirmations and reminders for people who already have a relationship. No marketing lists. No SMS to inquiry visitors beyond today’s ACS notify-to-Elyse pattern. Never use `ALERT-*` for student/agent comms.

---

## Phased backlog

### Phase 0 — Plan + systems of record

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `STUDIO-P0-001` | Studio ops plan: CRM, personas, GCal, automation Action IDs | `done` | — | `docs/plans/studio-teaching-business.md`, `AGENTS.md`, `lesson-payments.md` |

<details>
<summary><code>STUDIO-P0-001</code> — Plan as backlog SoT</summary>

**Acceptance criteria**

- [x] North star names Studio as relationship SoT, Google Calendar as time SoT, Stripe as money SoT
- [x] Personas table (`student`, `parent`, `agent`, `casting`, `alumni`) with distinct LTV models
- [x] Discrete phases `STUDIO-P1`–`P6` with Action IDs and unchecked ACs for unbuilt work
- [x] Cross-link from [`lesson-payments.md`](./lesson-payments.md) backlog item 8
- [x] `AGENTS.md` Studio north star mentions people / calendar / automations

</details>

---

### Phase 1 — People and personas

**Goal:** Elyse can open `/studio/people`, add a contact, tag personas, and write a note — without a third-party CRM.

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `STUDIO-P1-001` | Contact store + schema (Table Storage) | `done` | `STUDIO-P0-001` | `infra/modules/portfolio/studio_crm.tf`, `api/src/lib/contacts.js`, `api/src/lib/tableGeo.js` |
| `STUDIO-P1-002` | Persona model + related contacts | `done` | `STUDIO-P1-001` | Same store; validation |
| `STUDIO-P1-003` | `/studio/people` list + detail (create/edit) | `done` | `STUDIO-P1-002` | `src/pages/studio/people.astro`, `src/pages/studio/people/person.astro` |
| `STUDIO-P1-004` | Privacy + logging contract for CRM PII | `done` | `STUDIO-P1-001` | `src/pages/privacy.astro`; Functions logs |
| `STUDIO-P1-005` | Help catalog for People (only once UI ships) | `done` | `STUDIO-P1-003` | `src/lib/studioHelp.ts`, `src/pages/studio/help.astro` |
| `STUDIO-P1-006` | People export (not a sync in-request CSV) | `planned` | `STUDIO-P1-003` | Background / emailed file when ready |

<details>
<summary><code>STUDIO-P1-001</code> — Contact store</summary>

**Acceptance criteria**

- [x] Azure Table Storage (preferred) or Cosmos serverless provisioned in env stacks; no always-on Postgres
- [x] Env accounts are Standard **RA-GRS** so People can read the paired region (eastus2 → Central US) if the primary is down; writes stay on the primary until an account failover
- [x] If a new billable SKU is added: [`cost-and-quotas.md`](../runbooks/cost-and-quotas.md) + `budget.tf` + `SUBSCRIPTION_BUDGET_USD` updated in the same PR
- [x] Contact record: id, display name, email, phone, personas[], notes, created/updated — **values never committed**
- [x] Auth: People requires `people.read` / `people.write` (`STUDIO-P6`); signed-in is not enough. Publish uses the same catalog (`content.publish`).
- [x] Staging seed (15 fictional rows) runs in CD **after Terraform apply and before SWA upload** (`scripts/seed-studio-people.sh`) — not inside Functions. Prod is not seeded. Local: `npm run studio:seed-people`
- [ ] Sync CSV download — **removed**; data-not-hostage export is `STUDIO-P1-006`

</details>

<details>
<summary><code>STUDIO-P1-002</code> — Personas</summary>

**Acceptance criteria**

- [x] Personas are a multi-select set: `student` \| `parent` \| `agent` \| `casting` \| `alumni`
- [x] Student fields: rate, format (NYC / Zoom), package remaining, last lesson
- [x] Agent fields: agency, territory, last submission, last booking, next step
- [x] Related-contact links (student ↔ parent) stored; UI can navigate both ways
- [x] A contact can be both `student` and `alumni` (or student + parent) without duplicate rows

</details>

<details>
<summary><code>STUDIO-P1-003</code> — People UI</summary>

**Acceptance criteria**

- [x] `/studio/people` and `/studio/people/person?id=` (query-id) are SWA `authenticated`, `noIndex`, not in sitemap
- [x] List filterable by persona; search by name/email
- [x] Default sort is last name, then first name
- [x] Pagination: **10** people per page (not one long list)
- [x] Create / edit / archive (soft-delete) on iPhone Safari
- [x] Friendly errors + `correlationId` on API failure
- [x] Journey or smoke: unauthenticated `/studio/people` redirects to login (same contract as `/studio`)

</details>

<details>
<summary><code>STUDIO-P1-004</code> — Privacy</summary>

**Acceptance criteria**

- [x] Privacy Policy names Studio CRM as a store for inquiry + lesson + representation contacts (no sample PII in the page)
- [x] Function logs and App Insights: **kinds and contact ids only** — never email/phone/note bodies
- [x] Scorecard / monthly digest still counts inquiries only — no CRM names

</details>

<details>
<summary><code>STUDIO-P1-005</code> — Help</summary>

**Acceptance criteria**

- [x] `/studio/help` documents People only after `STUDIO-P1-003` ships
- [x] No Gemini tools invented that mutate CRM without an explicit confirm UI

</details>

<details>
<summary><code>STUDIO-P1-006</code> — People export</summary>

**Acceptance criteria**

- [ ] No synchronous `GET /api/contacts?format=csv` (or equivalent) that builds the full file in the request
- [ ] Operator can take a copy of People data without it living only in Table Storage (async job, emailed link, or similar)
- [ ] Logs still use kinds + contact ids only — never email/phone/note bodies in the export job log

</details>

---

### Phase 6 — Roles, permissions, and user profiles

**Goal:** One permission catalog is the source of truth for Studio actions. Publish, People, and Access admin share the same roles and discrete IDs. Sign-in is identity only.

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `STUDIO-P6-001` | Permission catalog + role bundles | `done` | `STUDIO-P1-001` | `api/src/lib/permissions.js` |
| `STUDIO-P6-002` | User-profile store (`studioUsers` table) | `done` | `STUDIO-P6-001` | `api/src/lib/users.js`; `infra/modules/portfolio/studio_crm.tf` |
| `STUDIO-P6-003` | Enforce catalog on People + publish APIs | `done` | `STUDIO-P6-002`; `STUDIO-P1-003` | `api/src/lib/studioAccess.js`; contacts + publish Functions |
| `STUDIO-P6-004` | Session API + hub / People / Access UI | `done` | `STUDIO-P6-003` | `GET /api/studioSession`; `src/pages/studio.astro`; `/studio/access` |
| `STUDIO-P6-005` | Allowlist → Owner bootstrap + runbook/help | `done` | `STUDIO-P6-004` | `ensureOwnerFromAllowlist`; `docs/runbooks/manage-access.md`; help |

<details>
<summary><code>STUDIO-P6-001</code> — Catalog</summary>

**Acceptance criteria**

- [x] Discrete IDs: `content.publish`, `people.read`, `people.write`, `users.read`, `users.manage`
- [x] `people.write` implies `people.read`; `users.manage` implies `users.read`
- [x] Roles: `owner` (all), `publisher` (publish only), `people` (read+write), `people_reader` (read)
- [x] Profiles may add `extraPermissions` or subtract `deniedPermissions` (deny wins)
- [x] New capabilities are added here — handlers do not invent ad-hoc checks

</details>

<details>
<summary><code>STUDIO-P6-002</code> — Profiles</summary>

**Acceptance criteria**

- [x] Azure Table `studioUsers` on the existing CRM storage account (not a new SKU)
- [x] Identity match on Entra `userId`, email / UPN
- [x] Optional `crmOwnerKey` so a People operator shares the coach’s contact partition
- [x] Disabled status grants no catalog IDs
- [x] Logs: ids and kinds only — never emails or display names

</details>

<details>
<summary><code>STUDIO-P6-003</code> — Enforcement</summary>

**Acceptance criteria**

- [x] Every privileged Function calls `permissionGate()` (publish uses `publisherGate()` = `content.publish`)
- [x] People list/create/edit require `people.read` / `people.write` — signed-in is not enough
- [x] Access admin requires `users.read` / `users.manage`
- [x] Development (`AZURE_FUNCTIONS_ENVIRONMENT=Development`) grants the full catalog for `func start`
- [x] Removing someone from `ALLOWED-USER-IDS` does not revoke an existing profile

</details>

<details>
<summary><code>STUDIO-P6-004</code> — UI</summary>

**Acceptance criteria**

- [x] `GET /api/studioSession` (and `publisherStatus`) return roles + `permissions[]`; `authorized` means `content.publish`
- [x] Hub shows People / Access / publish tiles from those permissions — missing publish does not hide People
- [x] `/studio/access` lets Owners assign roles and extra/denied IDs
- [x] Signed-in users with zero catalog permissions still open `/studio/help` and `/studio/health`

</details>

<details>
<summary><code>STUDIO-P6-005</code> — Bootstrap + docs</summary>

**Acceptance criteria**

- [x] First session for an allowlisted caller with no profile writes an Owner row; later checks use the profile
- [x] [`manage-access.md`](../runbooks/manage-access.md) documents the catalog, `/studio/access`, and allowlist-as-bootstrap
- [x] Help Access section describes sign-in vs People vs publish vs Access
- [x] Monitor user (`TEST-C-005`) stays off the allowlist and is not granted a profile

</details>

---

### Phase 2 — Lifetime value and pay status

**Goal:** Each relationship shows a truthful LTV. Students roll up Stripe (plus offline rows). Agents show career value, not $0.

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `STUDIO-P2-001` | Student LTV from Stripe (email match) | `planned` | `STUDIO-P1-003`; lesson-payments webhook (`#6` done, `#7` planned) | `api/src/lib/stripeWebhook.js` |
| `STUDIO-P2-002` | Offline Venmo/cash row on the same student | `planned` | `STUDIO-P2-001` | People detail + API |
| `STUDIO-P2-003` | Agent / casting non-monetary value | `planned` | `STUDIO-P1-002` | People detail |
| `STUDIO-P2-004` | Upcoming lesson paid/unpaid + copy Payment Link | `planned` | `STUDIO-P2-001`; `STUDIO-P3-003` for “upcoming” | Studio pay status UI |

<details>
<summary><code>STUDIO-P2-001</code> — Student LTV</summary>

**Acceptance criteria**

- [ ] Webhook or periodic match: Stripe customer/charge email → contact, increment **student LTV (USD)**
- [ ] Stripe remains the ledger; Studio stores a rollup + last-synced timestamp, not a second books
- [ ] Refunds decrease the rollup
- [ ] Unmatched charges are listable in Studio as “needs a person” — no silent drop
- [ ] Cross-link: satisfies the Studio half of lesson-payments backlog **#7** (webhook → paid status)

</details>

<details>
<summary><code>STUDIO-P2-002</code> — Offline money</summary>

**Acceptance criteria**

- [ ] Manual amount + method (`venmo` \| `cash` \| `zelle` \| `other`) + date on a student
- [ ] Included in student LTV and in the month summary later (`STUDIO-P5-002`)
- [ ] Never treated as a Stripe charge

</details>

<details>
<summary><code>STUDIO-P2-003</code> — Agent value</summary>

**Acceptance criteria**

- [ ] Fields: last submission, last booking (title/year), recency, warmth or next-step — **not** a dollar total unless a real invoice exists
- [ ] Stale threshold is a Studio task input for Phase 4, not a public score

</details>

<details>
<summary><code>STUDIO-P2-004</code> — Pay status</summary>

**Acceptance criteria**

- [ ] Upcoming lessons (from Calendar write-back) show paid / unpaid
- [ ] Copy/share the matching Payment Link on iPhone
- [ ] No card charge from unconfirmed voice prompts

</details>

---

### Phase 3 — Google Calendar scheduling

**Goal:** Availability is whatever is already on Elyse’s Google calendars. Confirmed lessons write back. No second calendar of record.

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `STUDIO-P3-001` | Google Calendar OAuth (Elyse only) + KV secrets | `planned` | `STUDIO-P1-001` | env vault placeholders; `rotate-secrets.md` |
| `STUDIO-P3-002` | Read free/busy + availability rules | `planned` | `STUDIO-P3-001` | API + `/studio/calendar` |
| `STUDIO-P3-003` | Write confirmed lessons to Google Calendar | `planned` | `STUDIO-P3-002`; `STUDIO-P1-003` | API; event ↔ contact id |
| `STUDIO-P3-004` | Recurring weekly students | `planned` | `STUDIO-P3-003` | Series on Google Calendar, not “meeting links” |
| `STUDIO-P3-005` | Help + operator runbook for Calendar connect | `planned` | `STUDIO-P3-003` | `studioHelp.ts`; new runbook |

<details>
<summary><code>STUDIO-P3-001</code> — OAuth</summary>

**Acceptance criteria**

- [ ] One Google account (Elyse). Tokens in the **env** Key Vault (placeholders in Terraform, `lifecycle { ignore_changes }`)
- [ ] Secret **names** only in git (e.g. `GOOGLE-CALENDAR-OAUTH-CLIENT-ID` / refresh token). **Never** echo tokens in logs or Actions
- [ ] [`rotate-secrets.md`](../runbooks/rotate-secrets.md) extended when names ship
- [ ] Re-consent path in Studio if Google revokes access; friendly error + `correlationId`

</details>

<details>
<summary><code>STUDIO-P3-002</code> — Availability</summary>

**Acceptance criteria**

- [ ] Studio reads free/busy from the calendars she selects (lessons, shows, personal)
- [ ] Rules: 30 / 60 min, Zoom vs NYC, buffer, minimum notice
- [ ] A rehearsal already on Google Calendar blocks a lesson slot
- [ ] `/studio/calendar` week/day view on iPhone Safari (list-first is OK)

</details>

<details>
<summary><code>STUDIO-P3-003</code> — Write-back</summary>

**Acceptance criteria**

- [ ] Confirming a lesson in Studio creates/updates a Google Calendar event (title/time/location/Zoom)
- [ ] Event stores the Studio contact id (extended property or description convention) so pay status and reminders can join
- [ ] Cancel / reschedule in Studio updates or deletes the Google event; Google-side deletes are detected on next sync (document last-write rules)
- [ ] No HubSpot/Cal.com meeting-link branding

</details>

<details>
<summary><code>STUDIO-P3-004</code> — Recurring students</summary>

**Acceptance criteria**

- [ ] Weekly (or custom) series lives on Google Calendar
- [ ] Studio shows the next N occurrences linked to the student
- [ ] Exception (cancel one week) does not delete the series

</details>

<details>
<summary><code>STUDIO-P3-005</code> — Calendar docs</summary>

**Acceptance criteria**

- [ ] Help documents connect + “Google is the calendar” only after write-back ships
- [ ] Operator runbook: connect account, which calendars to include, what to do if sync fails (no token values)

</details>

---

### Phase 4 — Contact automation

**Goal:** Inquiries become CRM rows. Students get transactional confirmations and reminders. Agents get stale-relationship **tasks**, not marketing drips.

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `STUDIO-P4-001` | Inquiry → create/update CRM contact | `planned` | `STUDIO-P1-003`; existing `POST /api/contactInquiry` | `api/src/functions/contactInquiry.js` |
| `STUDIO-P4-002` | Lesson confirmation template (ACS email) | `planned` | `STUDIO-P4-001`; `STUDIO-P3-003` | ACS email; Studio “send confirm” |
| `STUDIO-P4-003` | Lesson reminders from Calendar | `planned` | `STUDIO-P4-002` | Timer Function or equivalent |
| `STUDIO-P4-004` | Agent / casting follow-up tasks | `planned` | `STUDIO-P2-003` | Studio task list — not a blast send |
| `STUDIO-P4-005` | Manual send from Studio (templates) | `planned` | `STUDIO-P4-002` | People detail |

<details>
<summary><code>STUDIO-P4-001</code> — Inquiry ingest</summary>

**Acceptance criteria**

- [ ] `type=lesson` upserts a contact with persona `student` (match on email)
- [ ] `type=casting` upserts persona `casting`
- [ ] Inquiry body stored as a note or activity — **not** written to git or App Insights message fields
- [ ] Existing ACS notify-to-Elyse (`SITE-CONTACT-*`) still fires; this ID does not replace it
- [ ] Duplicate email updates the same person (adds a persona if needed)

</details>

<details>
<summary><code>STUDIO-P4-002</code> — Confirmations</summary>

**Acceptance criteria**

- [ ] Operator taps **Send confirmation** on a scheduled lesson (not auto-send on first ship unless explicitly enabled)
- [ ] ACS **email** to the student/parent; copy is voice-lessons only
- [ ] Recipients are the contact’s email — never `ALERT-*`
- [ ] Privacy/Terms still cover transactional lesson mail

</details>

<details>
<summary><code>STUDIO-P4-003</code> — Reminders</summary>

**Acceptance criteria**

- [ ] Reminder job reads **Google Calendar** events that have a Studio contact id
- [ ] Default: email the day before; SMS only if the student has an explicit SMS-ok flag (do not SMS inquiry visitors)
- [ ] Idempotent per event occurrence; failures log correlation id only
- [ ] Quiet hours / timezone = America/New_York unless the contact overrides

</details>

<details>
<summary><code>STUDIO-P4-004</code> — Agent tasks</summary>

**Acceptance criteria**

- [ ] Studio shows “stale agent” when last contact exceeds a configurable number of days
- [ ] Action is a **task** for Elyse (open note / log submission), not an automatic email to the agent
- [ ] No casting-director drip campaigns

</details>

<details>
<summary><code>STUDIO-P4-005</code> — Manual templates</summary>

**Acceptance criteria**

- [ ] Short templates: lesson confirm, reminder, “here is the pay link,” “thanks for the materials request”
- [ ] Send is always an explicit tap
- [ ] Help documents templates only after they ship

</details>

---

### Phase 5 — Public slots and month report

**Goal:** Only after Google write-back is trustworthy. Public booker offers times that are actually free. Month rollup stays a thin Stripe + offline view.

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `STUDIO-P5-001` | Public free/busy slot picker on `/lessons/book` | `planned` | `STUDIO-P3-003` | `src/pages/lessons/book.astro`; public API (rate-limited) |
| `STUDIO-P5-002` | In-Studio month summary + Stripe export link | `planned` | `STUDIO-P2-001` | Studio reports UI |
| `STUDIO-P5-003` | Help for public booking + reports | `planned` | `STUDIO-P5-001` or `002` | `studioHelp.ts` |

<details>
<summary><code>STUDIO-P5-001</code> — Public slots</summary>

**Acceptance criteria**

- [ ] Slot picker reads Google free/busy; never invents open times
- [ ] Booking creates the Google event + Studio lesson row (same path as `STUDIO-P3-003`)
- [ ] Voice-lessons-only copy; inquire form remains for people who prefer email
- [ ] Anonymous endpoint is rate-limited + Turnstile; no contact dump
- [ ] Replaces email coordination only when Elyse turns it on (flag) — aligns with lesson-payments “Phase 3 scheduling if email breaks”

</details>

<details>
<summary><code>STUDIO-P5-002</code> — Month summary</summary>

**Acceptance criteria**

- [ ] Gross / fees / net / refunds from Stripe + offline rows
- [ ] Link out to Stripe export for the deep ledger
- [ ] No PII in the summary beyond counts Elyse already sees in Studio

</details>

<details>
<summary><code>STUDIO-P5-003</code> — Help</summary>

**Acceptance criteria**

- [ ] Help covers public booking and the month summary only after each ships

</details>

---

## Dependency graph

```text
STUDIO-P0-001 (done)
    └─► STUDIO-P1-001 store [done]
            ├─► P1-002 personas [done] ─► P1-003 UI [done] ─► P1-004 privacy [done]
            │                         ├─► P1-005 help [done]
            │                         └─► P1-006 export [planned]
            ├─► P6-001 catalog [done] ─► P6-002 profiles [done]
            │                         └─► P6-003 enforce [done] ─► P6-004 UI [done] ─► P6-005 bootstrap [done]
            ├─► P2-001 Stripe LTV ─► P2-002 offline ─► P2-004 pay status
            │         └─► P2-003 agent value ─► P4-004 tasks
            └─► P3-001 GCal OAuth ─► P3-002 free/busy ─► P3-003 write-back
                                          ├─► P3-004 recurring ─► P3-005 docs
                                          ├─► P4-002 confirm ─► P4-003 reminders
                                          │         └─► P4-005 templates
                                          └─► P5-001 public slots
P1-003 + contactInquiry ─► P4-001 inquiry ingest
P1-003 ─► P6-003 People gate
P2-001 ─► P5-002 month summary
lesson-payments #7 (Checkout / webhook polish) ║ P2-001 / P2-004
```

---

## Out of scope

| Item | Why |
|------|-----|
| HubSpot / HoneyBook / My Music Staff as CRM SoT | Studio owns people; those products split agents vs students or steal Stripe |
| Acting-lesson ops or marketing | Brand: voice lessons only |
| Gemini silent charges or silent CRM writes | Confirm UI required |
| Marketing SMS / email lists | Privacy + current inquiry SMS is notify-to-Elyse only |
| `ALERT-*` for student/agent mail | On-call stays ops-only |
| Multi-teacher payroll / student portal SaaS | One coach; add only if asked |
| Always-on Postgres “because CRM” | Table Storage first; cost-sync if that changes |
| PagerDuty / `OPS-P3-002` | Unrelated; do not implement until asked |

---

## Related

| Doc | Role |
|-----|------|
| [`lesson-payments.md`](./lesson-payments.md) | Stripe money SoT; backlog **#7** / **#8** point here (`STUDIO-P2`, `P3`, `P5`) |
| [`rotate-secrets.md`](../runbooks/rotate-secrets.md) | Extend when `STUDIO-P3-001` OAuth names ship |
| [`cost-and-quotas.md`](../runbooks/cost-and-quotas.md) | Recalc if Phase 1+ adds a billable Azure SKU |
| [`manage-access.md`](../runbooks/manage-access.md) | Roles, discrete permissions, `/studio/access` |
| [`.cursor/rules/studio-help.mdc`](../../.cursor/rules/studio-help.mdc) | Help catalog only after capabilities ship |
| [`ux-release-testing-strategy.md`](./ux-release-testing-strategy.md) | Auth’d Studio journeys when People/Calendar exist |
