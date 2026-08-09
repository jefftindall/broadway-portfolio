# Monthly site check-in email

A short guide for **Elyse** (and anyone else who receives the monthly email) on how to read it and what to do.

You do **not** need to understand Azure, GitHub, or the technical scorecard. Jeff handles that. Your job is a two-minute skim: is the site healthy for casting, and is hosting spend still sensible?

## What you get

Around the **1st of each month**, an email arrives with a subject like:

> **ElyseTindall.com monthly check-in · August 2026**

It summarizes:

1. Overall site health  
2. A short **Worth a glance** list — only if something needs you  
3. **Last month on the site** — visits, inquiries, Studio updates (graded), and a few top pages  
4. Whether the homepage, resume, and headshot links are healthy **and** content is still fresh, plus page speed and Studio publish success  
5. Last month’s hosting cost vs the budget  

It never includes passwords, secret keys, or private phone numbers.

## Annotated reference

![Annotated monthly site check-in email with numbered callouts](../ops/images/monthly-site-check-in-annotated.png)

Agents editing the digest must follow [`.cursor/rules/ops-monthly-checkin-email.mdc`](../../.cursor/rules/ops-monthly-checkin-email.mdc) so layout and color stay stable. The email shows **status pills**, not day/month formulas — those formulas are only in the tables below (for you) and in code.

| # | Section | What it means | What to look for |
|---|---------|---------------|------------------|
| **1** | Subject line | Confirms this is the monthly check-in | Opens fine on your phone; month/year matches |
| **2** | Overall health banner | One-line verdict for the whole month | **Green** = fine · **Amber** = keep an eye on it · **Red** = act (text Jeff) |
| **3** | Worth a glance | Your short action list | Appears only when something needs attention. If the section is missing, you are done after the green banner. |
| **4** | Last month on the site | Visits, casting vs lesson inquiries, Studio updates, numbered top pages | Visits / inquiries are informational. **Studio updates** show a green/amber/red pill. |
| **5** | For visitors & casting | Homepage, resume, headshot, page speed, Studio publish success | Read the **status pill** and short note. Red on a materials link usually means “act.” |
| **6** | Hosting cost | What Azure charged last month vs the monthly budget (~$34) | Bar / **% of budget used**, or **Over budget** → message Jeff. Small dollar swings are normal. |
| **7** | Detailed scorecard link | Full technical write-up | Optional — for Jeff. You can ignore it. |

Numbers and dollar amounts in the picture are **examples**. Your real email will show that month’s actual figures.

### Reading “Last month on the site”

| Line | Meaning |
|------|---------|
| **Visits** | Roughly how many people opened public pages (sessions · people). From Google Analytics. |
| **Inquiries** | Casting + lesson contact forms that were accepted (after spam checks), shown separately. |
| **Studio updates** | Successful Studio publishes last month, with a green / amber / red status. |
| **Top pages** | Busiest pages as a numbered list with plain-language names (Homepage, a show/news title, etc.). |

This block is a calm snapshot. It does **not** replace Jeff’s separate Search Console review for ranking/queries.

### Homepage / resume / headshot freshness

The email does **not** list the day/month cutoffs — it only shows green / amber / red. Behind the scenes (and for this guide):

| Item | Looking good | Keep an eye on it (amber) | Needs attention (red) |
|------|--------------|---------------------------|------------------------|
| **Homepage** | Updated within ~30 days | **30–60 days** without an update | **60+ days**, or the link failed |
| **Resume** | Updated within ~6 months | **6–12 months** without an update | **12+ months**, or the link failed |
| **Headshot** | Updated within ~6 months | **6–12 months** without an update | **12+ months**, or the link failed |

**Studio updates** (in “Last month on the site”): red if fewer than **1** publish last month; amber if fewer than **4**; green at 4+.

## How is this actionable?

The email is useful only if it changes what you do. Use this decision table:

| If you see… | Do this |
|-------------|---------|
| Green banner + no “Worth a glance” section | **Nothing.** Archive the email. |
| Amber on Homepage / Resume / Headshot (“Keep an eye on it”) | **Optional:** refresh that content when you can (new show on home, resume PDF, or headshot). Text Jeff if you want help. |
| Red on Homepage | **Act:** message Jeff — either the link is broken or homepage content has gone **60+ days** without an update. |
| Red on Resume / Headshot | **Act:** message Jeff — either the link is broken or that file has gone **12+ months** without an update. |
| Amber on Studio updates (1–3 publishes) | **Optional:** plan a few more Studio publishes when you have content ready. |
| Red on Studio updates (0 publishes) | **Act if you meant to publish:** message Jeff if Studio felt broken; otherwise schedule at least one update soon. |
| Red banner or “Needs attention” on Homepage / Resume / Headshot / Page speed | **Act the same day:** open [elysetindall.com](https://elysetindall.com) yourself. If you also see a problem, text Jeff with what page failed. If the site looks fine to you, still ping Jeff — the monitor may have caught something intermittent. |
| “Needs attention” on Studio publishing or Live after publish | **Only if you tried to publish** and it failed or stayed draft-looking. Retry once from Studio; if it still fails, send Jeff the **Reference:** code from the error screen. If you did not publish that month, you can ignore Studio rows that say “not enough data.” |
| Hosting **Over budget** or the bar looks full | **Message Jeff** (no need to dig into Azure). Ask whether spend is expected (new feature, traffic spike) or needs trimming. |
| Spend missing / “could not be checked” | **No action for you** — Jeff will fix the cost report. |
| Low visits or zero inquiries in “Last month on the site” | **Usually nothing** — casting seasons are uneven. Only mention it if you expected a busy month and something else looks wrong. |
| Visits / inquiries / Studio line says “not available” | **No action for you** — reporting glitch on Jeff’s side. |

### What you should *not* do

- Do not chase the “detailed scorecard” link unless Jeff asks you to.  
- Do not change passwords, DNS, or Azure settings from this email.  
- Do not treat “Not enough data yet” as a failure — it usually means a quiet Studio month.  
- Do not treat low visit or inquiry counts as a site outage.  
- Separate from this email: **urgent** site-down or deploy alerts may still text/call Jeff’s ops channel. Those are emergencies; this monthly note is a calm summary.

## Quick phone checklist (only when amber/red)

1. Open the home page — does it load?  
2. Open your resume PDF / headshot from the materials path you share with casting — do they open?  
3. If you published recently from Studio — did the change show on the live site within about 20 minutes?  
4. Reply to Jeff with: page that failed + roughly when you checked + screenshot if easy.

## Who receives it?

The digest goes to the ops alert address and your site contact address (from Key Vault — never stored in the public repo). Same email body for both; Jeff uses it for ops, you use it for peace of mind and the rare “please look” nudge.

## Related

- Email format style guide (agents): [`.cursor/rules/ops-monthly-checkin-email.mdc`](../../.cursor/rules/ops-monthly-checkin-email.mdc)  
- [Cost and quotas](cost-and-quotas.md) — expected Azure spend and budget formula (technical)  
- Living technical scorecard: [`docs/ops/operational-excellence-scorecard.md`](../ops/operational-excellence-scorecard.md)  
- Manual GSC + GA review (Jeff): [search-ops-monthly.md](search-ops-monthly.md)  
- Preview the HTML locally (Jeff): `npm run ops:scorecard-email:preview`
