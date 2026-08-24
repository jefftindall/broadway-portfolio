# Plan: Studio as teaching-business ops

**Artifact ID:** `ELYSE-STUDIO-001`  
**Version:** 1.8  
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

Record shapes, Table Storage keys, git collections, and access-flow diagrams: [`docs/architecture/data-persistence.md`](../architecture/data-persistence.md). Login vs permission catalog: [`docs/architecture/authentication-authorization.md`](../architecture/authentication-authorization.md). Update both in the same PR when CRM, profiles, or authz change.

| Concern | System of record | Studio’s job |
|---------|------------------|--------------|
| **Relationships** | Studio CRM (`/studio/people`) | Create, edit, persona tags, notes, LTV display |
| **Time / availability** | **Google Calendar** (Elyse’s calendars) when connected | Read busy time; create lesson invites; never fork a second calendar. **Disconnected is valid:** the public site and Studio keep working; Elyse still gets an ICS reminder at `SITE-CONTACT-EMAIL` |
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
| People / CRM | `/studio/people` list + detail + student LTV (`STUDIO-P1`, `P2`) | Inquiry ingest (`STUDIO-P4`) |
| Schedule | Email / manual | Google Calendar invites + free/busy (`STUDIO-P3`); ICS fallback if Google is down |
| Payments | Stripe match + offline rows + copy Payment Links (`STUDIO-P2`) | Upcoming lesson paid/unpaid from Calendar (`STUDIO-P2-004` residual / `P3`) |
| Communications | Inquiry forms → email (ACS notify) | Student **Requested** then **Confirmed** (Elyse RSVP); reminders; inquiry → CRM (`STUDIO-P4`) |
| Financial reports | — | Month summary (gross / fees / net / refunds); deep ledger stays in Stripe/exports (`STUDIO-P5`) |
| Public booking | Inquire-then-email | Optional slot picker that reads Google free/busy (`STUDIO-P5`) |
| Help | `/studio/help` map + contextual guides (`/studio/help/content`, `/students`, `/admin`, `/access`) | Expand as ops capabilities ship (never before) |
| Access | Roles + discrete permissions (`STUDIO-P6`) at `/studio/admin/access` | Grant People without publish (and the reverse) |

### Studio IA (shipped chrome)

`/studio` is the **home chooser**. Workflow tabs (not Help): **Career · Content · Students · Admin**. Help icons deep-link to `/studio/help/*`.

| Surface | Route | Status |
|---------|--------|--------|
| Home | `/studio` | Four cards |
| Career | `/studio/career` | Agents / casting filters into People; career value on the person (`STUDIO-P2-003`) |
| Content | `/studio/content` | Speak + discrete publish hub |
| Students | `/studio/students` | **People** + **Payment status** live. Lesson schedules and reminders later |
| Admin | `/studio/admin` | Landing; **Access** at `/studio/admin/access` is live |
| Admin Calendar *(later)* | `/studio/admin/calendar` | **Global business-closed calendar** (holidays, vacations). Blocks **all** scheduling and sets auto-reply / response-time expectations. Not per-student lessons (those stay under Students) |
| Admin Reports *(later)* | `/studio/admin` reports tile | Not built |

`/studio/access` 301s to `/studio/admin/access`.

Payments vendor choice and Phase 1 checkout live in [`lesson-payments.md`](./lesson-payments.md). That plan’s Studio section should stay aligned with this north star.

---

## Status at a glance

| Phase / area | Status | Open residuals |
|--------------|--------|----------------|
| Phase 0 — Plan + Action IDs + SoT | `done` | — |
| Phase 1 — People & personas | `done` | Residual: `STUDIO-P1-006` async export |
| Phase 2 — Lifetime value + pay status | `done` | Residual: upcoming lesson paid/unpaid waits on `STUDIO-P3-003` |
| Phase 3 — Google Calendar scheduling | `planned` | Studio organizer OAuth + Elyse RSVP + ICS fallback; site never requires Google |
| Phase 4 — Contact automation | `planned` | Inquiry ingest; student **Requested** → **Confirmed** |
| Phase 5 — Public slots + month report | `planned` | After P3 write-back is reliable |
| Phase 6 — Roles, permissions, user profiles | `done` | Shipped after P1 in git (People needed the catalog). Listed last so phase numbers read 0–6. Live grants on `/studio/admin/access` |

**Suggested next:** `STUDIO-P3-001` (Google Calendar API + KV) after staging ledger table apply. Residual `STUDIO-P2-004` upcoming paid/unpaid joins Calendar write-back. Phase 6 is already `done` — do not treat it as upcoming work.

---

## How to use this document

| Section | Purpose |
|---------|---------|
| [North star](#north-star) | SoT rules and today vs later |
| [Status at a glance](#status-at-a-glance) | Done vs not done |
| [Personas](#personas) | Student / agent / parent / casting / alumni |
| [Product pillars](#product-pillars-future-studio) | UI map |
| [Google Calendar integration choice](#google-calendar-integration-choice) | Why Studio-organizer OAuth + Elyse RSVP (not the easiest manual setup) |
| [Lesson request lifecycle](#lesson-request-lifecycle) | Student **Requested** → **Confirmed** when Elyse accepts |
| [Phased backlog](#phased-backlog) | Implementable `STUDIO-*` work (phases **0–6** in numeric order) |
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

1. **Personalized, not multi-tenant SaaS UI** — One coach’s business and **one People CRM per deployment** (Table partition `people`; staging and prod already have separate accounts). Authorized operators share that CRM via the permission catalog; unsigned capabilities stay hidden. Do not invent a second CRM per signed-in user.
2. **Mobile-first (iPhone 17 · Safari)** — Day-of pay status, “copy link,” and “who is next” must work on the phone.
3. **Correlation / friendly errors** — Same Studio API contract (`httpErrors` + `correlationId`); never raw Stripe or Google API errors in the UI.
4. **Content tools stay** — Rate and policy updates via Gemini remain valid; ops screens complement them, they don’t replace `/lessons` brand rules.
5. **No fake features in help** — `/studio/help` and `studioHelp.ts` only document shipped capabilities.
6. **Cheap store first** — Start with **Azure Table Storage** (or Cosmos serverless) so hosting stays cents-to-a-few-dollars. Do **not** add PostgreSQL Flexible Server until queries need it. Adding a billable SKU must update [`cost-and-quotas.md`](../runbooks/cost-and-quotas.md) and the subscription budget in the **same** infra PR.
7. **Calendar is Google’s** — Availability is free/busy on Elyse’s Google calendars when connected. Studio never becomes a competing calendar that can drift. Lesson **workflow** state (`requested` / `confirmed` / `declined`) lives in Table Storage so the site can operate without Google.
8. **Automation is transactional** — Confirmations and reminders for people who already have a relationship. No marketing lists. No SMS to inquiry visitors beyond today’s ACS notify-to-Elyse pattern. Never use `ALERT-*` for student/agent comms.
9. **Calendar auth is optional at runtime** — Missing tokens, revoked consent, Google 401/403, timeouts, or quota must **not** take down the public site, inquire/book, People, payments, or publish. Degrade: persist the lesson as `requested`, email Elyse an ICS at `SITE-CONTACT-EMAIL`, send the student **Requested**, log `correlationId` only. Calendar UI shows disconnected — never a 500.

---

## Google Calendar integration choice

Pick the option that is **most user-friendly for Elyse and students** and that **supports unattended automation**. Do **not** pick the option that is merely easiest to click through in Google Cloud Console.

Elyse signs into Studio with **Microsoft Entra**. Time still lives in **Google Calendar** (personal Gmail or Workspace — do not assume Domain-Wide Delegation). Students should not need a Google account to request a lesson.

### Options evaluated

| Option | What it is | Daily UX | Automation | Config burden | Verdict |
|--------|------------|----------|------------|---------------|---------|
| **A. ICS-only via ACS** | Email a `.ics` (`METHOD:REQUEST`) to Elyse and the student. No Google API. | Works in any mail app. No free/busy. Cannot see Accept in software. | Almost none. Confirm would be a Studio tap. | Lowest | **Fallback only** when Google is disconnected or the API fails |
| **B. OAuth as Elyse, insert on her calendar** | One “Connect Google” as Elyse. Studio creates events as **her** (she is organizer). | Events appear on her calendar immediately. She never **Accepts** an invite (organizers are already accepted). Student “Confirmed” would be a Studio button, not RSVP. | High (Calendar API) | Low–medium | Reject as **primary** — it is easier to wire, but it does not match “Confirmed when Elyse accepted the invite” |
| **C. Service account + calendar share** | Elyse shares calendars with a GCP robot email. | Robot-looking organizers; easy to get ACL wrong; invites look unprofessional. | Medium | Medium (manual share UI) | Reject |
| **D. Workspace domain-wide delegation** | Service account impersonates a Workspace user. | Fine unattended **if** the domain is Google Workspace with an admin. Studio login is Entra, not Workspace. Personal Gmail cannot be impersonated. | Highest unattended | High, Workspace-only | Reject unless the domain is already Workspace with an admin who will maintain DWD |
| **E. Cal.com / Calendly overlay** | Hosted booking SaaS in front of Google. | Friendly for students. Splits time SoT. Extra vendor. | Medium (their webhooks) | Low | Reject — easiest to configure, not our SoT |
| **F. Studio Google identity as organizer + Calendar API** | Dedicated Studio Google account (OAuth 2.0, offline refresh token in env KV) **creates** events and **invites Elyse + the student**. Optional second OAuth: Elyse connects **her** Google so Studio can read free/busy on the calendars she already uses (shows, personal, lessons). `events.watch` + incremental sync detect Elyse `attendees[].responseStatus === accepted`. | Elyse’s daily loop is native Google Calendar **Accept** on iPhone — the same gesture she uses for every other gig. Students get ACS **Requested** immediately, then ACS **Confirmed** when she Accepts. Slot picker (P5) uses her real busy time when her OAuth (or calendar ACL to the Studio account) is present. | Highest: create/update/cancel, guests, conference data, push notifications, RSVP. | Highest (GCP project, OAuth clients, possibly a bookings Google user, restricted-scope verification later if the app is published). Stay in Google Cloud **Testing** with Elyse (and the operator) as test users for the single-coach app — do not block on CASA. | **Select** |

### Selected architecture (F)

```text
Student / Studio requests a slot
        │
        ▼
Studio lesson row  status = requested
        │
        ├─► ACS email to student/parent: **Requested**
        │
        ├─► Google Calendar API (Studio organizer) ──success──► event
        │         attendees: Elyse (needsAction) + student
        │         sendUpdates: all  →  Elyse’s phone shows Accept / Decline
        │
        └─► on missing tokens / 401 / 5xx / timeout
                  ACS email to SITE-CONTACT-EMAIL with ICS METHOD:REQUEST
                  (same UID as the lesson id — so a later Google connect can match)

Elyse Accepts in Google Calendar
        │
        ▼
events.watch (or sync) → Elyse responseStatus = accepted
        │
        ├─► lesson row  status = confirmed
        ├─► ACS email to student/parent: **Confirmed**
        └─► Google sendUpdates so the student’s copy is confirmed

Elyse Declines (Google) or taps Decline in Studio
        │
        ▼
status = declined → ACS to student (optional copy) → cancel/update event
```

**Why not the easiest setup:** Option B (OAuth only as Elyse) is fewer Google identities and a single Connect button. It cannot give Elyse a real invite to Accept, so student **Confirmed** would be a Studio-only action. Option F costs a Studio-owned Google identity and two OAuth clients, and it is the one that matches how she already works (Accept on the phone) and how students should hear about the booking.

**Free/busy without Elyse OAuth:** hide or disable the public slot picker; inquire and Requested bookings still work. Do not invent open times.

**Confirm without Google RSVP (degraded):** Studio **Confirm** / **Decline** on the lesson (and a signed one-click link in the ICS email to Elyse). That path is how degraded mode reaches **Confirmed**. Do not parse inbound iTIP email.

**Secrets:** env Key Vault placeholders only (`GOOGLE-CALENDAR-ORGANIZER-REFRESH-TOKEN`, `GOOGLE-CALENDAR-ELYSE-REFRESH-TOKEN`, OAuth client id/secret names). `lifecycle { ignore_changes }`. Never echo tokens. Recipients stay `SITE-CONTACT-EMAIL` (Elyse reminder) and the contact’s email (student) — never `ALERT-*`.

---

## Lesson request lifecycle

Studio owns **workflow** state. Google Calendar owns **time** when connected.

| Status | When | Student / parent sees | Elyse |
|--------|------|------------------------|-------|
| `requested` | Lesson created (Studio or public book/inquire) | ACS email + any Studio/public copy labeled **Requested**. Not on their calendar as confirmed. | Google invite to Accept, **or** ICS at `SITE-CONTACT-EMAIL` if Google failed |
| `confirmed` | Elyse **accepted** the invite (`responseStatus=accepted`) or tapped Confirm in Studio (degraded) | ACS email labeled **Confirmed**. Google guest update / ICS when we have an event. | Event confirmed on Google when API works |
| `declined` | Elyse declined the Google invite or tapped Decline in Studio | Short ACS “cannot do that time” (voice-lessons copy) | Event cancelled when API works |
| `cancelled` | Either party cancels after confirm | Cancel notice | Event cancelled |

Rules:

- Persist the lesson row **before** calling Google. Google failure cannot lose the request or 500 the book/inquire API.
- **Requested** mail is automatic on create. **Confirmed** mail is automatic on Elyse accept — not an operator “Send confirmation” as the primary path (`STUDIO-P4-005` remains a manual resend).
- Reminders (`STUDIO-P4-003`) fire only for `confirmed`.
- Upcoming paid/unpaid (`STUDIO-P2-004`) joins `confirmed` lessons.
- Public success page (P5): “Requested — you’ll get Confirmed when Elyse accepts.”
- Logs: lesson id + status + `correlationId` — never student/Elyse addresses or token values.

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
- [x] Discrete phases `STUDIO-P1`–`P6` in **numeric order** with Action IDs and unchecked ACs for unbuilt work
- [x] Calendar integration choice: Studio organizer OAuth + Elyse RSVP; Google optional at runtime; ICS fallback to `SITE-CONTACT-EMAIL`
- [x] Lesson lifecycle: student **Requested** then **Confirmed** when Elyse accepts
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
- [x] Partition key is the constant `people` (`STUDIO_CONTACTS_PARTITION`) — not a CRM owner / Entra id. One CRM per environment.
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

### Phase 2 — Lifetime value and pay status

**Goal:** Each relationship shows a truthful LTV. Students roll up Stripe (plus offline rows). Agents show career value, not $0.

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `STUDIO-P2-001` | Student LTV from Stripe (email match) | `done` | `STUDIO-P1-003`; lesson-payments webhook (`#6` done) | `api/src/lib/stripeWebhook.js`, `api/src/lib/ledger.js` |
| `STUDIO-P2-002` | Offline Venmo/cash row on the same student | `done` | `STUDIO-P2-001` | People detail + `POST /api/contacts/{id}/offlinePayments` |
| `STUDIO-P2-003` | Agent / casting non-monetary value | `done` | `STUDIO-P1-002` | People detail + Career landing |
| `STUDIO-P2-004` | Upcoming lesson paid/unpaid + copy Payment Link | `in_progress` | `STUDIO-P2-001`; `STUDIO-P3-003` for “upcoming” | `/studio/students/payments` + person page |

<details>
<summary><code>STUDIO-P2-001</code> — Student LTV</summary>

**Acceptance criteria**

- [x] Webhook or periodic match: Stripe customer/charge email → contact, increment **student LTV (USD)**
- [x] Stripe remains the ledger; Studio stores a rollup + last-synced timestamp, not a second books
- [x] Refunds decrease the rollup
- [x] Unmatched charges are listable in Studio as “needs a person” — no silent drop
- [x] Cross-link: satisfies the Studio half of lesson-payments backlog **#7** (webhook → paid status)

</details>

<details>
<summary><code>STUDIO-P2-002</code> — Offline money</summary>

**Acceptance criteria**

- [x] Manual amount + method (`venmo` \| `cash` \| `zelle` \| `other`) + date on a student
- [x] Included in student LTV and in the month summary later (`STUDIO-P5-002`)
- [x] Never treated as a Stripe charge

</details>

<details>
<summary><code>STUDIO-P2-003</code> — Agent value</summary>

**Acceptance criteria**

- [x] Fields: last submission, last booking (title/year), recency, warmth or next-step — **not** a dollar total unless a real invoice exists
- [x] Stale threshold is a Studio task input for Phase 4, not a public score

</details>

<details>
<summary><code>STUDIO-P2-004</code> — Pay status</summary>

**Acceptance criteria**

- [ ] Upcoming lessons (from Calendar write-back) show paid / unpaid — **residual:** waits on `STUDIO-P3-003`
- [x] Copy/share the matching Payment Link on iPhone
- [x] No card charge from unconfirmed voice prompts

</details>

---

### Phase 3 — Google Calendar scheduling

**Goal:** Availability is whatever is already on Elyse’s Google calendars when connected. Lesson **requests** persist even when Google is not. Confirmed time writes back as a Google invite Elyse **Accepts**. No second calendar of record.

Selected integration: **Studio Google identity as event organizer** (option F in [Google Calendar integration choice](#google-calendar-integration-choice)). Not “OAuth as Elyse and insert as organizer” (easier to configure, wrong Accept semantics).

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `STUDIO-P3-001` | Calendar API: Studio organizer OAuth + optional Elyse free/busy OAuth + KV | `planned` | `STUDIO-P1-001` | env vault placeholders; `rotate-secrets.md`; `/studio/admin/calendar` connect |
| `STUDIO-P3-002` | Read free/busy + availability rules (degrade if disconnected) | `planned` | `STUDIO-P3-001` | API + `/studio/calendar` |
| `STUDIO-P3-003` | Lesson requests: Google invite + ICS fallback + RSVP → confirmed | `planned` | `STUDIO-P3-001`; `STUDIO-P1-003` | API; lesson table; event ↔ contact id |
| `STUDIO-P3-004` | Recurring weekly students | `planned` | `STUDIO-P3-003` | Series on Google Calendar, not “meeting links” |
| `STUDIO-P3-005` | Help + operator runbook for Calendar connect | `planned` | `STUDIO-P3-003` | `studioHelp.ts`; new runbook |
| `STUDIO-P3-006` | Runtime: Google optional; ICS to `SITE-CONTACT-EMAIL` on failure | `planned` | `STUDIO-P3-003` | book/inquire + Studio create-lesson paths |

<details>
<summary><code>STUDIO-P3-001</code> — OAuth (Studio organizer + Elyse free/busy)</summary>

**Acceptance criteria**

- [ ] Dedicated **Studio Google account** is the Calendar API organizer (OAuth 2.0 authorization code, `access_type=offline`, refresh token in the **env** Key Vault; Terraform placeholders + `lifecycle { ignore_changes }`)
- [ ] Optional second OAuth: Elyse connects **her** Google in Studio so free/busy can read the calendars she selects (lessons, shows, personal). Missing Elyse OAuth does **not** block booking
- [ ] Secret **names** only in git (e.g. `GOOGLE-CALENDAR-ORGANIZER-REFRESH-TOKEN`, `GOOGLE-CALENDAR-ELYSE-REFRESH-TOKEN`, client id/secret names). **Never** echo tokens in logs or Actions
- [ ] [`rotate-secrets.md`](../runbooks/rotate-secrets.md) extended when names ship
- [ ] Re-consent path in Studio if Google revokes either grant; friendly error + `correlationId`; rest of Studio stays usable
- [ ] Single-coach app stays in Google Cloud **Testing** with named test users; do not block the phase on public OAuth verification / CASA
- [ ] Implementation PR adds any new catalog ID (e.g. `calendar.connect`) to `permissions.js` + Access UI in the **same** PR

</details>

<details>
<summary><code>STUDIO-P3-002</code> — Availability</summary>

**Acceptance criteria**

- [ ] When Elyse OAuth (or equivalent ACL) is connected: Studio reads free/busy from the calendars she selects
- [ ] Rules: 30 / 60 min, Zoom vs NYC, buffer, minimum notice
- [ ] A rehearsal already on Google Calendar blocks a lesson slot
- [ ] `/studio/calendar` week/day view on iPhone Safari (list-first is OK)
- [ ] When Calendar is disconnected: view shows a clear disconnected state (not a 500); operators can still create a **Requested** lesson by typing a time

</details>

<details>
<summary><code>STUDIO-P3-003</code> — Invites, RSVP, write-back</summary>

**Acceptance criteria**

- [ ] Creating a lesson persists a Studio lesson row (`requested`) **before** any Google call; Google failure does not lose the row
- [ ] When organizer OAuth works: insert event as Studio organizer, attendees = Elyse (`SITE-CONTACT-EMAIL` Google) + student/parent; `sendUpdates=all` so Elyse gets a native Accept invite
- [ ] Event stores the Studio lesson id + contact id (extended property) so pay status, RSVP, and reminders can join
- [ ] `events.watch` (with channel renewal) or incremental sync flips the row to `confirmed` when Elyse `responseStatus` is `accepted`, and to `declined` when `declined`
- [ ] Studio **Confirm** / **Decline** still exist for degraded mode and must keep Google in sync when the API is up
- [ ] Cancel / reschedule in Studio updates or deletes the Google event when connected; Google-side deletes are detected on next sync (document last-write rules)
- [ ] No HubSpot/Cal.com meeting-link branding

</details>

<details>
<summary><code>STUDIO-P3-004</code> — Recurring students</summary>

**Acceptance criteria**

- [ ] Weekly (or custom) series lives on Google Calendar when connected
- [ ] Studio shows the next N occurrences linked to the student (`requested` until Elyse accepts the series/instance rules documented in the runbook)
- [ ] Exception (cancel one week) does not delete the series

</details>

<details>
<summary><code>STUDIO-P3-005</code> — Calendar docs</summary>

**Acceptance criteria**

- [ ] Help documents connect, Requested vs Confirmed, and “Google is the calendar” only after invite write-back ships
- [ ] Operator runbook: Studio organizer account, Elyse Connect Google, which calendars to include, what happens when Google is down (ICS to `SITE-CONTACT-EMAIL`), no token values

</details>

<details>
<summary><code>STUDIO-P3-006</code> — Google-optional runtime + ICS fallback</summary>

**Acceptance criteria**

- [ ] Public site, inquire, book, People, payments, and publish succeed when Calendar tokens are missing, revoked, or Google returns 401/403/429/5xx / timeout
- [ ] On Google failure (or not connected): ACS **email** to `SITE-CONTACT-EMAIL` with `text/calendar` ICS `METHOD:REQUEST` (UID = lesson id) so Elyse still gets a calendar reminder in Mail/Google
- [ ] Student still receives **Requested** (`STUDIO-P4-002`); they are not blocked on Google
- [ ] Failures log kind + `correlationId` only — never token or PII bodies
- [ ] Calendar UI and public slot picker degrade (hidden/disabled picker, disconnected banner) — never uncaught 500s

</details>

---

### Phase 4 — Contact automation

**Goal:** Inquiries become CRM rows. Students see **Requested**, then **Confirmed** when Elyse accepts the invite. Reminders stay transactional. Agents get stale-relationship **tasks**, not marketing drips.

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `STUDIO-P4-001` | Inquiry → create/update CRM contact | `planned` | `STUDIO-P1-003`; existing `POST /api/contactInquiry` | `api/src/functions/contactInquiry.js` |
| `STUDIO-P4-002` | Student **Requested** then **Confirmed** (ACS email) | `planned` | `STUDIO-P3-003`; `STUDIO-P3-006` | ACS email; lesson status machine |
| `STUDIO-P4-003` | Lesson reminders for **confirmed** lessons | `planned` | `STUDIO-P4-002` | Timer Function or equivalent |
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
<summary><code>STUDIO-P4-002</code> — Requested → Confirmed</summary>

**Acceptance criteria**

- [ ] On lesson create: ACS email to the student/parent whose subject and body clearly say **Requested** (time, Zoom vs NYC, “you’ll get Confirmed when Elyse accepts”)
- [ ] When the lesson becomes `confirmed` (Elyse **Accept** on the Google invite, or Studio Confirm / signed email link in degraded mode): ACS email that clearly says **Confirmed**
- [ ] Primary path is automatic — not an operator **Send confirmation** tap (`STUDIO-P4-005` is resend only)
- [ ] Copy is voice-lessons only; recipients are the contact’s email — never `ALERT-*`
- [ ] Privacy/Terms still cover transactional lesson mail
- [ ] Studio People / schedule UI labels the same statuses (**Requested** / **Confirmed**) so Elyse and students share one vocabulary

</details>

<details>
<summary><code>STUDIO-P4-003</code> — Reminders</summary>

**Acceptance criteria**

- [ ] Reminder job reads **confirmed** Studio lessons (join Google event id when present)
- [ ] Do not remind `requested` lessons — the student has not been Confirmed yet
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

- [ ] Slot picker reads Google free/busy when connected; never invents open times
- [ ] If free/busy is unavailable, hide the picker and keep inquire — do not 500 `/lessons/book`
- [ ] Booking uses the same `STUDIO-P3-003` path (persist `requested`, then Google invite or ICS fallback)
- [ ] Success copy: **Requested** — Confirmed comes when Elyse accepts
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

### Phase 6 — Roles, permissions, and user profiles

**Goal:** One permission catalog is the source of truth for Studio actions. Publish, People, and Access admin share the same roles and discrete IDs. Sign-in is identity only.

| ID | Title | Status | Depends on | Primary files |
|----|-------|--------|------------|---------------|
| `STUDIO-P6-001` | Permission catalog + role bundles | `done` | `STUDIO-P1-001` | `api/src/lib/permissions.js` |
| `STUDIO-P6-002` | User-profile store (`studioUsers` table) | `done` | `STUDIO-P6-001` | `api/src/lib/users.js`; `infra/modules/portfolio/studio_crm.tf` |
| `STUDIO-P6-003` | Enforce catalog on People + publish APIs | `done` | `STUDIO-P6-002`; `STUDIO-P1-003` | `api/src/lib/studioAccess.js`; contacts + publish Functions |
| `STUDIO-P6-004` | Session API + hub / People / Access UI | `done` | `STUDIO-P6-003` | `GET /api/studioSession`; Access UI now `/studio/admin/access` |
| `STUDIO-P6-005` | Allowlist → Super Administrator bootstrap + runbook/help | `done` | `STUDIO-P6-004` | `ensureOwnerFromAllowlist`; `docs/runbooks/manage-access.md`; help |

<details>
<summary><code>STUDIO-P6-001</code> — Catalog</summary>

**Acceptance criteria**

- [x] Discrete IDs: `content.publish`, `people.read`, `people.write`, `users.read`, `users.manage`
- [x] `people.write` implies `people.read`; `users.manage` implies `users.read`
- [x] Roles: `super_administrator` (all; legacy `owner` still accepted), `publisher` (publish only), `people` (read+write), `people_reader` (read)
- [x] Profiles may add `extraPermissions` or subtract `deniedPermissions` (deny wins)
- [x] New capabilities are added here — handlers do not invent ad-hoc checks

</details>

<details>
<summary><code>STUDIO-P6-002</code> — Profiles</summary>

**Acceptance criteria**

- [x] Azure Table `studioUsers` on the existing CRM storage account (not a new SKU)
- [x] Identity match on Entra `userId`, email / UPN
- [x] Contacts use a constant `people` partition — profiles do **not** carry `crmOwnerKey`
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
- [x] `/studio/admin/access` lets Super Administrators assign roles and extra/denied IDs (`/studio/access` redirects here)
- [x] Signed-in users with zero catalog permissions still open `/studio/help` and `/studio/health`

</details>

<details>
<summary><code>STUDIO-P6-005</code> — Bootstrap + docs</summary>

**Acceptance criteria**

- [x] First session for an allowlisted caller with no profile writes a Super Administrator row; later checks use the profile
- [x] [`manage-access.md`](../runbooks/manage-access.md) documents the catalog, `/studio/admin/access`, and allowlist-as-bootstrap
- [x] Help Access section describes sign-in vs People vs publish vs Access
- [x] Monitor user (`TEST-C-005`) stays off the allowlist and is not granted a profile

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
            ├─► P2-001 Stripe LTV [done] ─► P2-002 offline [done] ─► P2-004 pay status [in_progress]
            │         └─► P2-003 agent value [done] ─► P4-004 tasks
            └─► P3-001 Studio organizer OAuth ─► P3-002 free/busy (optional)
                                          └─► P3-003 invite + RSVP ─► P3-006 ICS fallback / Google optional
                                                            ├─► P3-004 recurring ─► P3-005 docs
                                                            ├─► P4-002 Requested/Confirmed ─► P4-003 reminders
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
| Cal.com / Calendly as time SoT | Easier to configure; splits calendar away from Google |
| Requiring Google login on the public site | Book/inquire must work with no Google auth |

---

## Related

| Doc | Role |
|-----|------|
| [`lesson-payments.md`](./lesson-payments.md) | Stripe money SoT; backlog **#7** / **#8** point here (`STUDIO-P2`, `P3`, `P5`) |
| [`rotate-secrets.md`](../runbooks/rotate-secrets.md) | Extend when `STUDIO-P3-001` OAuth names ship |
| [`cost-and-quotas.md`](../runbooks/cost-and-quotas.md) | Recalc if Phase 1+ adds a billable Azure SKU |
| [`manage-access.md`](../runbooks/manage-access.md) | Roles, discrete permissions, `/studio/admin/access` |
| [`.cursor/rules/studio-help.mdc`](../../.cursor/rules/studio-help.mdc) | Help catalog only after capabilities ship |
| [`ux-release-testing-strategy.md`](./ux-release-testing-strategy.md) | Auth’d Studio journeys when People/Calendar exist |
