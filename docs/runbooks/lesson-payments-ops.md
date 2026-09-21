# Runbook: Lesson payment operations (Stripe)

Operator workflows for **private voice lessons** paid through Stripe. Money stays in Stripe; Studio CRM (`STUDIO-P2-*`) mirrors paid status from webhooks — see [`lesson-payments.md`](../plans/lesson-payments.md) and [`data-persistence.md`](../architecture/data-persistence.md#3-stripe--money).

Do **not** put student emails, card data, or API keys in git, chat, or PR bodies. Keys and webhook secrets: [rotate-secrets.md](./rotate-secrets.md#stripe-lesson-payments).

## Test vs live

| Environment | Stripe mode | Dashboard toggle | Public pay on `/lessons/book` |
|-------------|-------------|------------------|-------------------------------|
| Staging (`test.elysetindall.com`) | **Test** | Stripe Dashboard → **Test mode** (top right) | `LESSON_PAYMENTS_ENABLED=true` |
| Production (`elysetindall.com`) | **Live** | Turn **Test mode off** | `false` until go-live (`terraform apply -var='lesson_payments_enabled=true'`) |

Use [Stripe test cards](https://docs.stripe.com/testing) on staging. Refund tests in test mode do not move real money.

## Day-of charge (before Zoom or in-person)

Pick one — all are valid Phase 1 paths:

### 1. Text or email a Payment Link (fastest)

1. Open Stripe Dashboard → **Payment links** (correct test/live mode).
2. Copy the **30-minute** or **60-minute** link (same URLs the site uses — also in Studio People when `people.read` is granted).
3. Send in your lesson reminder SMS/email: “Pay here before we start: …”
4. Confirm payment in Dashboard → **Payments** before starting the lesson.

Site CTAs use **Checkout** when price IDs are configured (`POST /api/lessonCheckout`); Payment Links remain the operator copy/share path and Studio fallback.

### 2. Stripe mobile app (card on file / manual entry)

1. Install the [Stripe Dashboard mobile app](https://stripe.com/app).
2. Sign in to the correct account (test vs live).
3. **Payments** → **+** → charge **$60** or **$100** (or custom amount for makeup fees).
4. Add the student name in **Description** or **Metadata** (`lesson_rate_id` if you use metadata manually).

### 3. One-off Payment Link (custom amount)

1. Dashboard → **Payment links** → **New**.
2. Set a one-time amount (package credit, late fee, etc.).
3. Share the link the same way as fixed lesson links.

**Habit:** Note the student name in the payment description so the monthly export and Studio LTV email match are easier.

## Refunds (full or partial)

Policy copy lives on [`/terms#paid-lessons`](../../src/content/pages/terms.md) (24-hour cancellation window). Stripe executes the money movement.

1. Dashboard → **Payments** → locate the charge (search email or amount).
2. Open the payment → **Refund**.
3. Choose **full** or **partial** amount.
4. Add an internal note (reason: cancellation, duplicate, goodwill).
5. Submit — funds return to the original method (timing varies by wallet/card).

**Test mode:** Run at least one refund test before prod go-live (lesson-payments backlog exit criteria).

Webhook `charge.refunded` updates Studio ledger rollups (`STUDIO-P2-001`). Unmatched payments: `/studio/students/payments` → unmatched queue.

## Monthly ledger (taxes / bookkeeping)

Stripe is the system of record. Export once per month (or connect QuickBooks/Xero later).

1. Dashboard → **Reports** → **Balance** (or **Payments** → export).
2. Set date range to the calendar month (e.g. 1 Aug – 31 Aug).
3. **Export** → CSV.
4. Archive the file (e.g. `stripe-2026-08.csv` off-repo).

**Columns to keep:** date, description/customer email, gross, fee, net, refunds, payout date.

| Column / concept | Use |
|------------------|-----|
| Gross | Amount charged |
| Fee | Stripe processing |
| Net | After fees |
| Refunds | Separate rows or netted — keep both views if your bookkeeper prefers |
| Payout date | When cash hit the bank |

**Offline methods:** Venmo Business, Zelle, cash, or check are **not** in Stripe. Log those rows in the same monthly spreadsheet so the books stay whole (optional Venmo Business QR — label clearly in the sheet).

Studio month summary (`STUDIO-P5-002`, planned) will link here; until then use Dashboard exports.

## Site checkout vs Payment Links

| Path | Who uses it | How |
|------|-------------|-----|
| **Checkout** (`POST /api/lessonCheckout`) | Visitors on `/lessons/book` when flag + price IDs are set | Turnstile → redirect to Stripe Checkout → return to `/lessons/book?paid=1` |
| **Payment Links** | Operator share/copy, Studio People | `https://buy.stripe.com/…` from env vault |

Both feed the same webhook → `studioLedger` when email matches a People row.

## When rates change

Advertised rates live in [`src/content/pages/lessons-book.md`](../../src/content/pages/lessons-book.md). After editing:

1. `terraform apply` **staging** (new Stripe prices + `STRIPE_PRICE_IDS` app setting).
2. Validate on staging (`/lessons/book` pay CTAs + one test checkout).
3. `terraform apply` **prod** when ready to promote.

See [rotate-secrets.md](./rotate-secrets.md#stripe-lesson-payments).

## Related

- Secrets + go-live flag: [rotate-secrets.md](./rotate-secrets.md#stripe-lesson-payments)
- Studio paid/unpaid UI: [`/studio/students/payments`](../../src/pages/studio/students/payments.astro) (`STUDIO-P2-004`)
- Calendar scheduling: [studio-calendar.md](./studio-calendar.md)
- Plan backlog: [lesson-payments.md](../plans/lesson-payments.md)
