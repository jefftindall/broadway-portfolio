# Plan: Lesson payments on elysetindall.com

## Context

Private **voice** lessons are currently inquire-then-schedule: rates live on [`/lessons/book`](../../src/content/pages/lessons-book.md) ($60 / 30 min, $100 / 60 min; NYC in-person or Zoom), and payment is off-site / informal. The public site is Astro on Azure Static Web Apps; Studio publish already uses Azure Functions.

**Goals for payments:**

1. Accept many methods students already use (cards, Apple Pay, Google Pay, PayPal, Cash App, Venmo where possible).
2. Make **personal / casual** pay easy (link, QR, tap) without a heavy booking overhaul.
3. Support **pay immediately before a lesson** (day-of / door / Zoom start).
4. Support **full and partial refunds**.
5. Produce a **monthly ledger** of gross, fees, net, and refunds for taxes and bookkeeping.
6. Choose a vendor stack scored on complexity, cost, setup effort, and annual maintenance.

This plan compares options and recommends a phased path. It does **not** implement checkout yet.

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

- **No-show / cancellation:** Written policy on `/lessons/book` and Terms (e.g. charge at booking vs charge day-of; refund window).
- **Chargebacks:** Keep lesson notes/emails; Stripe chargeback fee (~$15) if disputed.
- **Sales tax:** Voice lessons may be nontaxable in some jurisdictions; confirm with a tax pro before enabling Stripe Tax.
- **Privacy:** Payment processors are separate controllers; update Privacy Policy when collecting payments (student email on Stripe receipts).
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

## Implementation backlog (when approved)

1. Stripe account + test-mode Payment Links for both rates.
2. Privacy/Terms updates for paid lessons.
3. `/lessons/book` (and optional home lessons module) Pay CTAs → live links.
4. Operator runbook: day-of charge, refund, monthly CSV (new doc under `docs/runbooks/`).
5. Journey test: pay CTA present; no acting-lesson copy regression (`LESSON-01`).
6. Later: Checkout Session Function; later still: scheduler evaluation.

No infra/Terraform required for Phase 1 Payment Links (external SaaS). Phase 2 needs Function env secrets (`STRIPE_SECRET_KEY`, webhook signing secret) and Key Vault patterns consistent with existing Studio secrets.
