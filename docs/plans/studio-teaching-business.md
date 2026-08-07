# Plan: Studio as teaching-business ops

## North star

**Studio** (`/studio` and `/studio/*`) is the login-protected workspace for running the teaching business—not only a content publisher. Over time it should be the place to operate lessons day to day: schedule, payment status, student communications, and financial visibility—while the public site stays the portfolio + inquire/book surface.

### Non-negotiables

| Rule | Meaning |
|------|---------|
| **Auth-gated** | SWA `authenticated` on `/studio` and `/studio/*`; never public nav or sitemap |
| **Personalized** | UI and data scoped to the signed-in user (identity from SWA / Entra). Publish allowlist remains separate from “can open Studio” |
| **Teaching-first** | Voice lessons only (pedagogy, vocal health, CCM)—no acting-lesson ops or marketing |
| **One home for ops** | Prefer deepening Studio over scattering schedule/pay/comms across unrelated apps—processors (e.g. Stripe) stay systems of record for money movement |

### Today vs later

| Area | Today (in scope now) | Later (out of scope for immediate build; plan for it) |
|------|----------------------|------------------------------------------------------|
| Content | Voice/text → Gemini → site publish | Keep; still part of running the brand |
| Schedule | Email / manual | Calendar view, upcoming lessons, availability |
| Payments | Not in Studio (Stripe Dashboard / Payment Links when adopted) | Who is paid / unpaid per lesson; share pay links; optional refund shortcuts |
| Communications | Inquiry forms → email | Thread or templates for confirmations, reminders, follow-ups |
| Financial reports | — | Month summary (gross / fees / net / refunds); deep ledger stays in Stripe/exports |
| Help | `/studio/help` capability catalog | Expand as ops capabilities ship |

Payments vendor choice and Phase 1 checkout live in [`lesson-payments.md`](./lesson-payments.md). That plan’s Studio section should stay aligned with this north star.

---

## Product pillars (future Studio)

```text
┌─────────────────────────────────────────────────────────────┐
│ Studio (authenticated · personalized)                       │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Schedule     │ Payments     │ Comms        │ Reports        │
│ upcoming     │ paid/unpaid  │ reminders    │ month summary  │
│ availability │ pay links    │ confirmations│ fees / net     │
│ no-shows     │ packages     │ inquiry inbox│ export link    │
├──────────────┴──────────────┴──────────────┴────────────────┤
│ Content publish (existing Gemini tools) · Help              │
└─────────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   Public site          Stripe (money)
   /lessons/book        Dashboard / APIs
```

### Payment-related Studio functions (when payments ship)

**Do in Studio (ops):** see who paid for upcoming lessons; copy/share Payment Links; sync rates with live prices; light month summary; log offline Venmo/cash with the same student/lesson record.

**Leave in Stripe (money):** disputes, payouts, tax forms, full Balance CSV, Tap to Pay hardware, payment-method configuration.

Do not invent Gemini tools that silently charge a card from free-form speech without an explicit confirm UI.

---

## Design constraints

1. **Personalized, not multi-tenant SaaS UI** — One coach’s business. If more publishers are allowlisted later, each still sees only their own ops data unless we explicitly design shared access.
2. **Mobile-first (iPhone 17 · Safari)** — Day-of pay status and “copy link” must work on the phone before a lesson.
3. **Correlation / friendly errors** — Same Studio API contract (`httpErrors` + `correlationId`); never raw Stripe errors in the UI.
4. **Content tools stay** — Rate and policy updates via Gemini remain valid; ops screens complement them, they don’t replace `/lessons` brand rules.
5. **No fake features in help** — `/studio/help` and `studioHelp.ts` only document shipped capabilities.

---

## Suggested sequencing (not a commitment)

1. **Payments Phase 1** — Stripe Payment Links + public CTAs; ops still in Stripe Dashboard ([`lesson-payments.md`](./lesson-payments.md)).
2. **Studio pay status** — Read-only “upcoming / paid” fed by Stripe webhooks or Dashboard habit + manual mark.
3. **Schedule surface** — Even a simple list of confirmed lessons before a full calendar product.
4. **Comms** — Templates / send confirmation; later inbox.
5. **Reports** — In-Studio month rollup + link to Stripe export.

Each step should keep Studio auth-only and personalized. Prefer thin API + Stripe as ledger over rebuilding a bank in Azure.
