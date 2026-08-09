# Plan: Discrete site variables vs flexible Studio content

**Artifact ID:** `ELYSE-FLEX-001`  
**Version:** 1.3  
**Last updated:** 2026-08-09  
**Audience:** Agents, implementers, Studio publishers  
**Scope:** Which Studio/Gemini tools may rewrite which content, and how **discrete** fields (rates, later site settings) stay consistent across UI + SEO — not casting SEO strategy itself (`DISC-*`) or GA/GSC (`SEARCH-*`).

Use the **Action ID** column (`FLEX-*`) to reference items in PRs, issues, and commits.

Example PR title: `FLEX-P1-002: Remove update_about from Studio tools`

**Status values:** `planned` · `in_progress` · `blocked` · `done` · `wont_fix`

---

## How to use this document

| Section | Purpose |
|---------|---------|
| [Status at a glance](#status-at-a-glance) | Done vs not done summary |
| [Problem](#problem) | Why the split exists |
| [Content tiers](#content-tiers) | A flexible / B discrete / C locked |
| [Current architecture](#current-architecture) | What shipped vs original sketch |
| [Phased backlog](#phased-backlog) | Implementable `FLEX-*` work with acceptance criteria |
| [Risks](#risks-and-decisions) | Open decisions |
| [Success criteria](#success-criteria) | Definition of done for the track |

Implement **one phase (or one `FLEX-*` item) per PR** when practical. Prefer linking this doc from the PR body.

---

## Status at a glance

| Area | Status | Notes |
|------|--------|-------|
| Split lessons philosophy vs rates/scheduling pages | `done` | `/lessons` vs `/lessons/book`; rates live in `lessons-book.md` frontmatter |
| `update_lesson_rates` (+ scheduling / book SEO tools) | `done` | Merge into book page; Zod via `lessonsBookFrontmatterSchema` |
| Remove monolith `update_lessons` full-page replace | `done` | Replaced by `update_lessons_copy` + `update_lessons_seo` (copy still body-writable) |
| Strip dollar amounts from `lessons.md` | `done` | Philosophy page points to book page for rates |
| Docs / Studio help for lessons routing | `done` | `refine-studio-gemini.md`, `studioHelp.ts` |
| Publish Zod validation for markdown frontmatter | `done` | `api/src/lib/contentValidate.js` |
| Remove `update_about` (About → locked / PR-only) | `done` | Full-page tool removed; `update_short_bio` for About lead |
| Remove / constrain `create_or_update_casting_page` | `done` | Full create/replace removed; `update_casting_fields` merges FM only |
| Narrow publish path allowlist by kind | `done` | Kind-scoped + exact `site-settings.json`; `about.md` denied |
| Stable rate `id`s + required `priceAmount` | `done` | Ids `30min` / `60min`; Zod + normalize enforce both |
| `src/data/site-settings.json` registry | `done` | Reopened for P3 (reel, shortBio, performer); rates stay on book page |
| Inject live rates into draft catalog context | `done` | Catalog includes live rates + settings snapshot |
| Structured Preview for discrete fields | `done` | `FLEX-P4-001` — labeled Preview + Quick edit rates |
| Tool ↔ path pair enforcement at publish | `planned` | Phase 4 residual (`FLEX-P4-002`) |
| Extend discrete registry (reel, performer facts, bio, …) | `done` | Strong P3 shipped; medium candidates still on-demand |

### Phase rollup

| Phase | Intent | Status |
|-------|--------|--------|
| **Phase 1** — Stop the bleed | Remove dangerous full-page tools; tighten allowlist; de-dupe rates from philosophy markdown | **Done** |
| **Phase 2** — Discrete rates pipeline | Safe Studio updates for prices only | **Done** (P2-004/005/007; rates on book page) |
| **Phase 3** — Extend discrete registry | More allowlisted fields as needed | **Strong done**; medium still `planned` on demand |
| **Phase 4** — Preview & guardrails polish | Structured diffs; tool/path mismatch reject | **Partial** — `FLEX-P4-001` `done`; P4-002/003 `planned` |

---

## Problem

After the site refresh, Studio (Gemini tool calls → draft → publish → GitHub) could **fully replace** pages that are no longer meant to be freeform content. The original risk set:

- A single lessons tool replacing all of `src/content/pages/lessons.md` (including rates prose)
- `update_about` replacing all of `src/content/pages/about.md`
- `create_or_update_casting_page` rewriting any casting landing page

Rates were also duplicated across UI code, markdown, and JSON-LD — so a voice update could overwrite philosophy copy, leave panels unchanged, and desync schema.org prices.

**Goal:** Keep Studio strong for **flexible** content (shows, news, gallery), and move everything else to **discrete, validated variables** (or out of Studio entirely).

**Progress so far:** Lessons rates/scheduling on `/lessons/book`; About body and casting create locked; Strong discrete registry (`site-settings.json`) + structured Studio Preview shipped.

---

## Content tiers

| Tier | Intent | Studio behavior | Examples |
|------|--------|-----------------|----------|
| **A — Flexible** | Evergreen-ish entries the publisher creates/edits often via natural language | Structured Gemini tools that write one markdown file per entry | Shows, news posts, gallery photos |
| **B — Discrete** | Small, typed fields that must stay consistent across UI + SEO | Narrow tools / structured frontmatter or `site-settings.json`; labeled Preview forms | Lesson rates; reel URL; performer facts; short bio; casting FM fields |
| **C — Locked** | Brand-critical copy and layout chrome | Not Gemini-writable; change via PR / design work | Hero copy, nav; About body; casting bodies; new casting lander create |

### Policy for current tools

| Tool today | Proposed tier | Status | Action |
|------------|---------------|--------|--------|
| `upsert_show` | A | `done` | Keep |
| `create_news_post` | A | `done` | Keep |
| `add_gallery_photo` | A | `done` | Keep |
| `update_lesson_rates` | B | `done` | Keep; ids + `priceAmount` required |
| `update_lesson_scheduling` / `update_lesson_book_seo` | B | `done` | Keep (book page only) |
| `update_lessons_copy` / `update_lessons_seo` | B/C hybrid | `done` (split) | Prefer merge; consider locking copy later if abuse risk |
| `update_reel_url` / `update_performer_facts` / `update_short_bio` | B | `done` | `site-settings.json` |
| `update_casting_fields` | B | `done` | Existing landers only; FM merge |
| `update_about` | C | `done` | **Removed** (`FLEX-P1-002`) |
| `create_or_update_casting_page` | C | `done` | **Removed** (`FLEX-P1-003`); create via [add-casting-page.md](../runbooks/add-casting-page.md) |

---

## Current architecture

### Rates SoT (shipped)

Canonical rates live in **`src/content/pages/lessons-book.md` frontmatter** (`rates[]` with `id`, `label`, `price`, `priceAmount`). Studio updates them only via `update_lesson_rates` (merge, Zod-validated). Philosophy copy stays on `lessons.md` without dollar amounts.

```text
/lessons          → philosophy (update_lessons_copy / update_lessons_seo)
/lessons/book     → rates + scheduling (update_lesson_rates / update_lesson_scheduling / update_lesson_book_seo)
```

### Discrete site settings (shipped)

[`src/data/site-settings.json`](../../src/data/site-settings.json) holds reel URL, short bio, and performer facts. [`src/lib/site.ts`](../../src/lib/site.ts) re-exports them. Rates remain on the book page (not in this JSON).

### Publish-time hardening

Kind-scoped allowlist (`FLEX-P1-004`) shipped. Remaining polish: tool/path pair checks (`FLEX-P4-002`).
---

## Phased backlog

### Phase 1 — Stop the bleed (safety)

| ID | Title | Status | Depends on | Primary refs |
|----|-------|--------|------------|--------------|
| `FLEX-P1-001` | Split lessons tools; remove monolith full-page lessons replace | `done` | — | `api/src/lib/gemini.js`, `/lessons` + `/lessons/book` |
| `FLEX-P1-002` | Remove `update_about` from Gemini tools (About PR-only) | `done` | — | `gemini.js`, `studioHelp.ts`, refine-studio-gemini |
| `FLEX-P1-003` | Remove `create_or_update_casting_page` from default Studio tools | `done` | — | `gemini.js`; casting runbook |
| `FLEX-P1-004` | Narrow publish path allowlist by content kind | `done` | `FLEX-P1-002`, `FLEX-P1-003` | `isAllowedContentPath` / publish handler |
| `FLEX-P1-005` | Docs + Studio help match lessons vs book routing | `done` | `FLEX-P1-001` | `refine-studio-gemini.md`, `studioHelp.ts` |
| `FLEX-P1-006` | Strip rate dollars from `lessons.md` | `done` | `FLEX-P1-001` | `src/content/pages/lessons.md` |

<details>
<summary><code>FLEX-P1-001</code> — Split lessons tools</summary>

**Acceptance criteria**

- [x] No single tool replaces both philosophy and rates in one body write
- [x] Rates/scheduling tools target `lessons-book.md` / `/lessons/book` only
- [x] Lessons copy tool instructs “no dollar amounts”

</details>

<details>
<summary><code>FLEX-P1-002</code> — Remove About tool</summary>

**Acceptance criteria**

- [x] `update_about` removed from `functionDeclarations` and builders
- [x] Studio help / refine runbook no longer list About as voice-editable full page
- [x] System instruction tells model About body changes need a site PR (short bio tool for lead)

</details>

<details>
<summary><code>FLEX-P1-003</code> — Remove casting Studio tool</summary>

**Acceptance criteria**

- [x] `create_or_update_casting_page` removed from default Studio tools
- [x] [add-casting-page.md](../runbooks/add-casting-page.md) remains the SoT workflow for create
- [x] Help/docs updated; field merge via `update_casting_fields`

</details>

<details>
<summary><code>FLEX-P1-004</code> — Path allowlist by kind</summary>

**Acceptance criteria**

- [x] Studio publish allowlist is by kind (shows/news/gallery + allowed pages), not bare `src/content/`
- [x] Locked paths (`about.md`, and other non-allowlisted pages) rejected even if Preview is hand-edited
- [x] Book + lessons paths only writable among allowlisted pages; settings JSON exact path only

</details>

<details>
<summary><code>FLEX-P1-005</code> / <code>FLEX-P1-006</code></summary>

**Acceptance criteria**

- [x] Runbook documents `/lessons` vs `/lessons/book` tool routing
- [x] `lessons.md` has no `$NN` rate bullets; points to book page

</details>

**Phase 1 outcome (target):** Studio can only touch shows / news / gallery (+ photos) and the intentional lessons/book discrete tools. About/casting cannot be overwritten via prompts or Preview path edits.

---

### Phase 2 — Discrete rates pipeline

| ID | Title | Status | Depends on | Primary refs |
|----|-------|--------|------------|--------------|
| `FLEX-P2-001` | Rates SoT on book page (not freeform philosophy markdown) | `done` | `FLEX-P1-001` | `lessons-book.md` |
| `FLEX-P2-002` | UI / JSON-LD consume book-page rates | `done` | `FLEX-P2-001` | `src/pages/lessons/book.astro` (+ related) |
| `FLEX-P2-003` | `update_lesson_rates` merge + validate builder | `done` | `FLEX-P2-001` | `gemini.js`, `contentValidate.js` |
| `FLEX-P2-004` | Harden rate shape (stable ids + required `priceAmount`) | `done` | `FLEX-P2-003` | `contentSchemas.js`, normalizeLessonRates |
| `FLEX-P2-005` | Inject current rates into draft catalog context | `done` | `FLEX-P2-001` | `buildProductionSiteContext` |
| `FLEX-P2-006` | `site-settings.json` shared registry for rates | `wont_fix` | — | Rates stay on book page; JSON used for P3 keys instead |
| `FLEX-P2-007` | Smoke: voice rate change → book page only → live UI | `done` | `FLEX-P2-003` | `npm run test:api-flex` |

<details>
<summary><code>FLEX-P2-004</code> — Harden rate shape</summary>

**Acceptance criteria**

- [x] Stable allowlisted ids (`30min`, `60min`) — reject unknown ids
- [x] Numeric price field required for JSON-LD / UI (no string-only `$` as sole SoT)
- [x] Gemini cannot invent a third parallel rate tier without an explicit product decision

</details>

<details>
<summary><code>FLEX-P2-005</code> — Catalog injects live rates</summary>

**Acceptance criteria**

- [x] Draft context includes current rates (e.g. “60min $100”)
- [x] Model patches real values rather than guessing

</details>

---

### Phase 3 — Extend the discrete registry (as needed)

| ID | Title | Status | Depends on | Primary refs |
|----|-------|--------|------------|--------------|
| `FLEX-P3-001` | Discrete registry candidates (reel, performer facts, bio, casting template, …) | `done` | Phase 1–2 residual | `src/data/site-settings.json`, `src/lib/site.ts` |

Add allowlisted keys **only** when there is a clear Studio need, each with validation. Prefer the strong list first; medium only if publishers actually ask. Do **not** grow a general “edit any JSON” tool.

#### Strong (clear Studio need + safe to validate) — shipped

| Candidate | SoT / surface | Notes |
|-----------|---------------|--------|
| Reel URL | `site-settings.json` → `site.reelUrl` | `update_reel_url` |
| Performer facts | `site-settings.json` → `site.performer` | `update_performer_facts` |
| About short bio | `site-settings.json` → `site.shortBio` | `update_short_bio`; About body PR-only |
| Casting template fields | casting `.md` frontmatter | `update_casting_fields` (existing only) |

#### Medium (only if publishers ask)

| Candidate | SoT / surface | Notes / caveat |
|-----------|---------------|----------------|
| `lessonOfferings` titles/descriptions | `site.lessonOfferings` | Fixed ids; voice-editable copy only — no new freeform page body |
| Featured-show toggles | Show frontmatter / `upsert_show` | Prefer keeping on `upsert_show` unless toggles become a frequent standalone ask |
| Instagram / `sameAs` URLs | `site.instagram` (+ SEO `sameAs`) | Rarely change; URL-safe if needed |
| Materials download paths | `site.materials.*` | Usually ship with media upload; path allowlist only if Studio must retarget without a PR |
| `knowsAbout` / teaches list | `site.knowsAbout` — lessons JSON-LD | Allowlisted strings only — easy for the model to invent junk |

Out of scope for P3 (stay PR/ops): site email (`SITE_CONTACT_EMAIL` / Key Vault), inquire subject, `tagline` / `jobTitle` / `name` / `nav` / hero, chronological age/DOB, full About or casting markdown.

<details>
<summary><code>FLEX-P3-001</code> — Extend registry</summary>

**Acceptance criteria**

- [x] Each shipped field has its own tool (or allowlisted key) + Zod validation
- [x] Strong candidates preferred; medium only with an explicit Studio need
- [x] No return to full-page replace for About/casting without templates
- [x] Studio help updated in the same PR (example prompts per use case, incl. performer facts)
- [x] Performer facts remain outside markdown (`site-settings.json`) so page-body tools cannot overwrite them

</details>

---

### Phase 4 — Preview & guardrails polish

| ID | Title | Status | Depends on | Primary refs |
|----|-------|--------|------------|--------------|
| `FLEX-P4-001` | Structured Preview for discrete rate changes | `done` | `FLEX-P2-003` | Studio UI + Quick edit rates |
| `FLEX-P4-002` | Reject publish when tool / path pair mismatches | `planned` | `FLEX-P1-004` | `updateContent.js` / publish path |
| `FLEX-P4-003` | Optional early Zod/frontmatter check UX for flexible markdown | `planned` | — | Already partial via `validateContentFile` |

<details>
<summary><code>FLEX-P4-001</code> / <code>FLEX-P4-002</code></summary>

**Acceptance criteria**

- [x] Rate updates show dollar fields in Preview (not only raw markdown/JSON); Quick edit on compose
- [ ] Server rejects e.g. rates tool writing a non-book path (and inverse) — `FLEX-P4-002`

</details>

---

## Files likely to change (remaining work)

| Area | Paths |
|------|--------|
| Gemini tools / allowlist / builder | `api/src/lib/gemini.js` |
| Publish handler | `api/src/functions/updateContent.js` |
| Schemas / validate | `api/src/lib/contentSchemas.js`, `contentValidate.js` |
| Book / lessons content | `src/content/pages/lessons-book.md`, `lessons.md` |
| Docs / Studio copy | `docs/runbooks/refine-studio-gemini.md`, `src/lib/studioHelp.ts`, `AGENTS.md` |

Infra/Terraform: none expected for Phases 1–2 residual.

---

## Risks and decisions

| Risk / decision | Recommendation |
|-----------------|----------------|
| Publisher still needs occasional About tweaks | Short bio via Studio; full About body remains PR-only |
| Casting SEO velocity | Create via runbook; Studio field merge only |
| Gemini invents a third rate tier | Allowlist ids (`FLEX-P2-004`); ignore/reject unknown ids |
| Preview path tampering | Enforce path allowlist by content kind at publish (`FLEX-P1-004`) |
| Dual formatting (`$60` vs `60.00`) | Prefer required `priceAmount`; format display string at the edge |
| `lessons_copy` still overwrites philosophy body | Accept for now; lock to PR if quality/risk warrants |

---

## Success criteria

1. Natural-language Studio updates can still create/update **shows**, **news**, and **gallery** entries.
2. A rates request updates **only** the book-page rates SoT, and the lessons UI + JSON-LD stay in sync.
3. Studio **cannot** replace `about.md` or casting markdown via Gemini or Preview path edits.
4. Lessons philosophy is not mixed with live dollar amounts in the same freeform body.
5. Docs and Studio copy describe the flexible vs discrete split so publishers know what voice updates can do.

---

## Suggested implementation order

1. ~~Finish Phase 1 residual~~ `done`
2. ~~Harden rates + catalog + flex tests~~ `done`
3. ~~Strong Phase 3 + structured Preview (`FLEX-P4-001`)~~ `done`
4. Remaining: medium P3 on demand; `FLEX-P4-002` / `FLEX-P4-003` polish.
