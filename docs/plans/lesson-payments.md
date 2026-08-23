# Plan: Lesson payments on elysetindall.com

## Context

Private **voice** lessons are currently inquire-then-schedule: rates live on [`/lessons/book`](../../src/content/pages/lessons-book.md) ($60 / 30 min, $100 / 60 min; NYC in-person or Zoom), and payment is off-site / informal. The public site is Astro on Azure Static Web Apps; Studio publish already uses Azure Functions.

**Studio north star:** `/studio` is the login-protected, personalized workspace for **running the teaching business** (not only content publish). Over time it should surface schedule, who is paid, communications, and financial reports. Those ops surfaces are **out of scope for the first payments rollout** but vendor and data choices below should not paint us into a corner—see [`studio-teaching-business.md`](./studio-teaching-business.md).

**Goals for payments:**

1. Accept many methods students already use (cards, Apple Pay, Google Pay, PayPal, Cash App, Venmo where possible).
2. Make **personal / casual** pay easy (link, QR, tap) without a heavy booking overhaul.
3. Support **pay immediately before a lesson** (day-of / door / Zoom start).
4. Support **full and partial refunds**.
5. Produce a **monthly ledger** of gross, fees, net, and refunds for taxes and bookkeeping.
6. Choose a vendor stack scored on complexity, cost, setup effort, and annual maintenance.
7. Prefer a processor whose APIs/webhooks can later feed **Studio** (paid status, month rollups) without abandoning Phase 1 Payment Links.

This plan compares options and recommends a phased path. Phase 1 Payment Links are **in progress**: test/live **API keys** live in `kv-elyse-shared`; each environment stack owns products, prices (synced from `lessons-book.md`), webhooks, and Payment Links (staging = test, prod = live) so catalog changes promote with the env.

_Last updated: 2026-08-22._

---

## Requirements mapped to capabilities

| Need | What “good” looks like |
|------|------------------------|
| Personal / casual pay | Shareable link or QR; no account creation for the student; works on iPhone Safari |
| Before-lesson charge | Charge in under a minute from phone or send a one-time link in the reminder text/email |
| Refunds | Full/partial from the same console that took the payment; audit trail |
| Monthly ledger | One export (CSV/PDF) with date, student/memo, method, gross, fee, net, refunds |
| Multi-method | Prefer **one merchant account** that surfaces many wallets vs. juggling apps |
| Fit this site | Prefer no-code or thin Azure Function glue; keep `/lessons` voice-only brand; preserve inquiry flow until scheduling is deliberate |
| Fit Studio later | Auth-only, personalized ops (schedule / paid / comms / reports); Stripe stays money system of record |

**Assumption for cost math below:** ~8 paid hours/week ≈ 32 × $100 sessions/month ≈ **$3,200/month** gross (~$38k/year). Scale the fee columns linearly if volume differs.

---

## Payment-method reality check

Not every brand can live in one checkout. For a US solo coach:

| Method | Notes |
|--------|--------|
| Cards (Visa/MC/Amex/Discover) | Available on Stripe, Square, PayPal |
| Apple Pay / Google Pay | Wallet UX over cards; **no extra fee** beyond the processor’s card rate when enabled on Stripe/Square |
| Cash App Pay | Native on **Stripe** and **Square** |
| PayPal | Native on **Stripe** (Dashboard enable) and **PayPal**; not a Square strength |
| Venmo | **Not** a first-class Stripe method today. Best via **PayPal** (Commerce / checkout) or a **Venmo Business Profile** side channel. Personal Venmo for lessons violates Venmo ToS and risks freezes |
| Zelle / cash / check | Fine as optional offline methods; must be logged manually for a complete ledger |

**Implication:** One processor can cover cards + Apple/Google + Cash App + PayPal. Venmo is either PayPal-backed or a separate app. A “accept everything” goal is met by **primary processor + optional Venmo Business QR**, not by five unrelated apps.

---

## Solution options

### A. Stripe Payment Links + Dashboard (recommended Phase 1)

**What:** Create Payment Links for 30- and 60-minute lessons (and later packages). Link them from `/lessons/book` and in confirmation emails/texts. Use the Stripe Dashboard / mobile app for day-of charges, refunds, and monthly Balance reports. Enable dynamic methods (cards, Apple Pay, Google Pay, Cash App Pay, PayPal, Link, ACH as desired) in the Dashboard—no `payment_method_types` hardcoding if/when Checkout Sessions are added later.

**Fits:** Personal pay, before-lesson links, refunds, ledger. Scheduling stays email-based until you choose otherwise.

| Dimension | Score (1–5, 5 = best) | Rationale |
|-----------|----------------------:|-----------|
| Complexity | **5** | No custom checkout code; hosted Stripe pages |
| Cost | **4** | ~2.9% + $0.30 online; $0 monthly; PayPal/Cash App rates may differ by method |
| Setup time | **5** | Account + identity + 2 links + Dashboard method toggles in a short session |
| Annual maintenance | **5** | Almost none beyond tax docs and occasional method toggles |
| **Overall** | **4.8** | Best default for this site and volume |

**Approx. processing at $3.2k/mo:** ~$102–110/mo fees (~$1.2–1.3k/yr) depending on method mix. Refunds return the charge; Stripe typically does not refund the original processing fee.

**Ledger:** Dashboard → **Balance** / **Payouts** reports, CSV export; optional QuickBooks/Xero sync later. Filters by month = monthly ledger of payments and fees.

**Day-of:** Text a Payment Link, create a one-off Payment Link for a custom amount, or charge from the Dashboard mobile app (including Tap to Pay on supported devices).

---

### B. Stripe Checkout / Payment Element on `/lessons/book` (Phase 2+)

**What:** Azure Function creates a Checkout Session; site redirects or embeds Checkout. Same merchant account and reporting as A. Prefer Checkout Sessions over raw PaymentIntents; omit hard-coded `payment_method_types` so Dashboard-configured methods appear dynamically.

**Fits:** Branded on-site pay CTA; still no full scheduler required.

| Dimension | Score | Rationale |
|-----------|------:|-----------|
| Complexity | **3** | Function + secrets + webhook + success/cancel URLs + PCI-safe hosted UI |
| Cost | **4** | Same processing as A; small engineering time |
| Setup time | **3** | Days of build/test vs hours for Payment Links |
| Annual maintenance | **3** | API/SDK updates, webhook monitoring, key rotation |
| **Overall** | **3.3** | Worth it when links feel too detached or you want metadata (lesson type, student email) enforced in-app |

---

### C. Square (Online + Appointments / POS)

**What:** Square Online payment links or Invoices; optional Square Appointments for booking + pay; Tap to Pay / reader for in-person NYC lessons.

**Fits:** Strong in-person; decent online cards + Apple/Google + Cash App. Weaker PayPal/Venmo story than Stripe+PayPal.

| Dimension | Score | Rationale |
|-----------|------:|-----------|
| Complexity | **4** | Polished merchant UI; Appointments adds product learning |
| Cost | **4** | Online ~2.9% + $0.30; in-person often slightly cheaper; $0–29+/mo if using Appointments paid tiers |
| Setup time | **4** | Fast for links; medium if adopting Appointments as system of record |
| Annual maintenance | **4** | Low if links-only; medium if calendar + clients live in Square |
| **Overall** | **4.0** | Prefer if in-person card-present volume dominates and you want Square’s POS ecosystem |

---

### D. PayPal Business (+ Venmo where enabled)

**What:** PayPal buttons / links; Venmo for eligible US checkout via PayPal products; separate PayPal reporting.

**Fits:** Students who insist on PayPal/Venmo. Incomplete alone (Apple/Google/Cash App coverage and ledger quality lag a full Stripe/Square stack).

| Dimension | Score | Rationale |
|-----------|------:|-----------|
| Complexity | **3** | Easy buttons; messy if also running Stripe/Square without a primary |
| Cost | **3** | Often ~2.99% + $0.49 online—higher fixed fee than Stripe/Square on $60–$100 tickets |
| Setup time | **4** | Fast for PayPal-only |
| Annual maintenance | **3** | Dispute UX and dual-ledger pain if not primary |
| **Overall** | **3.3** | Best as **method inside Stripe** or secondary, not sole processor |

---

### E. Venmo Business Profile / Cash App Business (standalone)

**What:** QR codes and @$handles for students who only want those apps.

**Fits:** Casual personal pay. Fails unified refunds and monthly ledger unless you spreadsheet every payment.

| Dimension | Score | Rationale |
|-----------|------:|-----------|
| Complexity | **2** | Easy per app; hard across books |
| Cost | **5** | Venmo Business ~1.9% + $0.10 (attractive); Cash App Business ~2.75% |
| Setup time | **5** | Minutes |
| Annual maintenance | **2** | Manual reconciliation; ToS risk if personal profiles are used |
| **Overall** | **3.5** | Optional **side channel** only; never the system of record |

---

### F. Acuity Scheduling (Squarespace Scheduling) + Stripe (or Square/PayPal)

**What:** Students book 30/60-min slots; pay deposit or full amount at booking; packages/memberships; Zoom link automation; intake forms. Processor still does money movement.

**Fits:** “Pay before the lesson” as **policy at booking**, packages, no-show card-on-file. Heavier than needed if email scheduling is working.

| Dimension | Score | Rationale |
|-----------|------:|-----------|
| Complexity | **2** | New ops system + calendar rules + copy migration |
| Cost | **2** | ~$16–49/mo SaaS **plus** ~2.9% + $0.30 processing (~$200–600/yr SaaS + ~$1.2k processing) |
| Setup time | **2** | Availability, forms, Zoom, policies, embedding |
| Annual maintenance | **2** | Plan renewals, calendar hygiene, student portal questions |
| **Overall** | **2.0** | Best **Phase 3** if booking volume makes email coordination the bottleneck |

Calendly + Stripe is lighter than Acuity but weaker on packages/deposits—fine for consults, weaker as a lesson studio OS.

---

### G. Multi-app “accept everything” (anti-pattern)

Run Stripe + Square + PayPal + Venmo + Cash App as equal primaries.

| Dimension | Score | Rationale |
|-----------|------:|-----------|
| Complexity | **1** | Five ledgers, five dispute portals |
| Cost | **2** | No fee savings; more time cost |
| Setup time | **2** | Repeated onboarding |
| Annual maintenance | **1** | Tax season pain |
| **Overall** | **1.5** | Reject as architecture |

---

## Scorecard summary

Scores: **5 = best** (simpler, cheaper, faster setup, less upkeep). Overall = mean of the four dimensions.

| Option | Complexity | Cost | Setup | Maint. | Overall | Primary role |
|--------|:----------:|:----:|:-----:|:------:|:-------:|--------------|
| **A. Stripe Payment Links** | 5 | 4 | 5 | 5 | **4.8** | **Recommended Phase 1** |
| C. Square links / Appointments | 4 | 4 | 4 | 4 | **4.0** | Alt if POS-first |
| E. Venmo/Cash App alone | 2 | 5 | 5 | 2 | **3.5** | Side channel only |
| B. Stripe Checkout on site | 3 | 4 | 3 | 3 | **3.3** | Phase 2 polish |
| D. PayPal-primary | 3 | 3 | 4 | 3 | **3.3** | Prefer via Stripe |
| F. Acuity + Stripe | 2 | 2 | 2 | 2 | **2.0** | Phase 3 scheduling |
| G. Multi-primary apps | 1 | 2 | 2 | 1 | **1.5** | Avoid |

**Coverage vs goals (A with PayPal + optional Venmo Business QR):**

| Goal | A Stripe Links | C Square | F Acuity+Stripe |
|------|:--------------:|:--------:|:---------------:|
| Cards / Apple / Google | ✓ | ✓ | ✓ (via processor) |
| Cash App | ✓ | ✓ | depends on processor |
| PayPal | ✓ (enable in Stripe) | weak | via PayPal connector |
| Venmo | side QR or PayPal product | weak | same |
| Personal easy pay | ✓ | ✓ | ✓ |
| Before-lesson | ✓ link / app | ✓ | ✓ at booking |
| Refunds | ✓ Dashboard | ✓ Dashboard | ✓ via processor |
| Monthly ledger | ✓ unified | ✓ unified | ✓ if one processor |

---

## Recommended path

### Phase 1 — Ship money movement (Stripe Payment Links)

1. Open Stripe (US sole prop / individual), complete identity verification, connect bank for payouts.
2. Create Products/Prices (or Payment Links) for **30-min ($60)** and **60-min ($100)**; optional “custom amount” link for makeup fees / packages.
3. In Payment method settings, enable **cards, Apple Pay, Google Pay, Cash App Pay, Link**; request/enable **PayPal** if eligible. Do **not** rely on personal Venmo.
4. Add clear **Pay for a lesson** CTAs on `/lessons/book` (and confirmation emails) pointing at the links—keep inquiry/scheduling copy; payment is additive.
5. Day-of workflow: text the matching link, or charge from Stripe Dashboard mobile before Zoom/in-person start.
6. Refunds: Dashboard → Payment → Refund (full/partial); note student name in description/metadata.
7. Monthly ledger: download Balance / activity CSV each month (or connect accounting). Columns to keep: date, description, gross, fee, net, refunds, payout date.
8. Optional: Venmo **Business** Profile QR for students who refuse cards—log those rows in the same monthly sheet so the ledger stays whole.

**Exit criteria:** First live paid lesson via Stripe; one successful refund test in test mode; one monthly CSV filed.

### Phase 2 — On-site checkout (only if needed)

- Azure Function creates Checkout Sessions; `/lessons/book` “Pay” buttons open Checkout.
- Webhook marks payment events (optional App Insights / email).
- Still no full calendar product required.
- Use restricted API keys; never put secret keys in the Astro client bundle.

### Phase 3 — Scheduling product (only if email booking breaks)

- Evaluate Acuity + Stripe (packages, deposits, no-show) vs Square Appointments (if in-person POS wins).
- Embed scheduler on `/lessons/book`; require payment or deposit at booking.
- Migrate Payment Links into “pay for package / gift” only.

---

## Workflows (Phase 1)

```text
Personal / advance pay
  Student opens /lessons/book → Payment Link → pays (card/wallet/PayPal/Cash App)
  → Stripe email receipt → you see payment in Dashboard → confirm lesson time by email

Before lesson begins
  You send Payment Link SMS/email OR open Dashboard mobile → charge $60/$100
  → Confirm paid → start Zoom / in-person

Refund
  Dashboard → select payment → partial or full refund → note reason
  → Student sees refund on original method (method-specific timing)

Monthly ledger
  Dashboard reports → export month range → archive CSV / import to bookkeeping
  → Add any Venmo Business / cash / Zelle rows manually
```

---

## Cost sketch (illustrative)

At **$3,200/month** card-like mix on Stripe online rates (~2.9% + $0.30 per $100 session ≈ 3.2% effective):

| Item | Phase 1 (Links) | Phase 3 (Acuity + Stripe) |
|------|----------------:|--------------------------:|
| Platform SaaS | $0 | ~$16–49/mo |
| Processing (~3.2%) | ~$102/mo | ~$102/mo |
| **Est. annual overhead** | **~$1.2k** | **~$1.4–1.8k** |

Venmo Business–heavy mix lowers processing % but **increases** reconciliation time—usually a bad trade unless most students refuse cards.

---

## Risks and policies to decide

- **No-show / cancellation:** Written on `/terms#paid-lessons` (24-hour full refund; inside 24 hours / no-shows may be non-refundable; studio may still refund). Pay CTAs on `/lessons/book` link to that section when the flag is on.
- **Chargebacks:** Keep lesson notes/emails; Stripe chargeback fee (~$15) if disputed.
- **Sales tax:** Voice lessons may be nontaxable in some jurisdictions; confirm with a tax pro before enabling Stripe Tax. **Do not** turn on Stripe Tax until that confirmation.
- **Privacy:** Stripe is a separate controller; Privacy Policy covers paid lessons (`/privacy#payments`).
- **Brand:** Payment CTAs must not imply acting lessons—voice lessons only.
- **PCI:** Hosted Payment Links / Checkout keep PAN off this site (preferred). Never build a custom card form that touches raw card numbers.

---

## Decision

| Choose… | If… |
|---------|-----|
| **Stripe Payment Links (A)** | Default: solo coach, email scheduling OK, want wallets + ledger fast |
| **Square (C)** | Mostly in-person NYC with Tap to Pay / reader as daily habit |
| **Acuity + Stripe (F)** | Ready to automate booking, packages, and prepaid policies |
| **Venmo/Cash App only (E)** | Temporary bridge—not a durable books strategy |

**Recommendation:** Start with **Option A (Stripe Payment Links + Dashboard)**, enable Apple Pay / Google Pay / Cash App Pay / PayPal on that account, optionally add a Venmo Business QR as a labeled side channel, and defer custom Checkout or Acuity until volume or scheduling pain justifies the maintenance score hit.

---

## Studio (later): payment ops inside teaching business

When Studio grows beyond publish (see [`studio-teaching-business.md`](./studio-teaching-business.md)), payment-related UI should live there as **ops**, with Stripe remaining the **money** system of record:

| In Studio (personalized, auth-only) | Stay in Stripe |
|-------------------------------------|----------------|
| Upcoming lessons + paid / unpaid | Disputes, payouts, tax forms |
| Copy / share Payment Links; one-off amount links | Payment method toggles, Tap to Pay hardware |
| Rate sync with live Stripe prices | Full Balance CSV / accounting sync |
| Month summary (gross / fees / net / refunds) | Deep ledger and exports |
| Optional offline Venmo/cash log tied to a lesson | — |

Do not charge cards from unconfirmed voice prompts. Keep `/studio` and `/studio/*` authenticated and user-scoped.

---

## Implementation backlog

| # | Work | Status |
|---|------|--------|
| 1 | Stripe account + shared Key Vault `STRIPE-TEST-*` / `STRIPE-LIVE-*` (staging maps test, prod maps live) | `done` (one-off copy from env vaults via `scripts/copy-stripe-keys-to-shared-kv.sh`) |
| 2 | Privacy/Terms updates for paid lessons | `done` (`/privacy#payments`, `/terms#paid-lessons`) |
| 3 | `/lessons/book` Pay CTAs gated by `LESSON_PAYMENTS_ENABLED` (staging **true**, prod **false**) | `in_progress` (UI wired; hidden on prod until go-live + live Payment Links) |
| 4 | Operator runbook: day-of charge, refund, monthly CSV | `planned` |
| 5 | Journey test: inquiry flow + legal copy; pay CTA when flag+links (`LESSON-01` / `LESSON-03`) | `done` |
| 6 | Per-env catalog: products, prices (cents from `lessons-book.md`), webhook endpoints, Payment Link upsert (staging = test keys, prod = live); `POST /api/stripeWebhook` | `done` |
| 7 | Later: Checkout Session Function; webhook → paid status for Studio | `planned` |
| 8 | Later: Studio schedule / paid / comms / reports per [`studio-teaching-business.md`](./studio-teaching-business.md) | `planned` |

CD ships **one Astro artifact** to staging and prod, so the pay-flow flag and Payment Link URLs are **runtime** SWA app settings (`GET /api/lessonPayConfig`), not baked `PUBLIC_*` vars. Restricted API keys (`rk_test_` / `rk_live_`) stay in **`kv-elyse-shared`**; webhook secrets and Payment Links live in the **env vault** and are never returned by that endpoint. Rate changes in `lessons-book.md` require an **environment re-apply** (staging, then prod) so Stripe prices follow the site. Populate / copy commands: [rotate-secrets.md](../runbooks/rotate-secrets.md#stripe-lesson-payments). Go-live on production: `terraform apply -var='lesson_payments_enabled=true'` in `infra/environments/prod` after live Payment Links are set.
