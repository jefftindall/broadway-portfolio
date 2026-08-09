# Plan: Discrete site variables vs flexible Studio content

**Artifact ID:** `ELYSE-FLEX-001`  
**Version:** 1.1  
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
| Remove `update_about` (About → locked / PR-only) | `planned` | Tool still full-body replaces `about.md` |
| Remove / constrain `create_or_update_casting_page` | `planned` | Still full markdown replace; casting stays SEO-sensitive |
| Narrow publish path allowlist by kind | `planned` | Still any path under `src/content/` (+ gallery photos) |
| Stable rate `id`s + single numeric `priceUsd` SoT | `planned` | Today: `label` + `price` (+ optional `priceAmount`); no id allowlist |
| `src/data/site-settings.json` registry | `wont_fix` | Rates shipped on `lessons-book.md` instead; revisit only if more discrete keys need a shared file |
| Inject live rates into draft catalog context | `planned` | Catalog lists URLs/titles; does not surface current `$` rates |
| Structured Preview for discrete rate diffs | `planned` | Phase 4 polish |
| Tool ↔ path pair enforcement at publish | `planned` | Phase 4 polish |
| Extend discrete registry (email, reel, bio field, …) | `planned` | Phase 3 — only when there is a clear Studio need |

### Phase rollup

| Phase | Intent | Status |
|-------|--------|--------|
| **Phase 1** — Stop the bleed | Remove dangerous full-page tools; tighten allowlist; de-dupe rates from philosophy markdown | **Partial** — lessons/rates split `done`; About/casting lock + path hardening still `planned` |
| **Phase 2** — Discrete rates pipeline | Safe Studio updates for prices only | **Mostly done** — via book-page frontmatter (not `site-settings.json`) |
| **Phase 3** — Extend discrete registry | More allowlisted fields as needed | `planned` |
| **Phase 4** — Preview & guardrails polish | Structured diffs; tool/path mismatch reject | `planned` |

---

## Problem

After the site refresh, Studio (Gemini tool calls → draft → publish → GitHub) could **fully replace** pages that are no longer meant to be freeform content. The original risk set:

- A single lessons tool replacing all of `src/content/pages/lessons.md` (including rates prose)
- `update_about` replacing all of `src/content/pages/about.md`
- `create_or_update_casting_page` rewriting any casting landing page

Rates were also duplicated across UI code, markdown, and JSON-LD — so a voice update could overwrite philosophy copy, leave panels unchanged, and desync schema.org prices.

**Goal:** Keep Studio strong for **flexible** content (shows, news, gallery), and move everything else to **discrete, validated variables** (or out of Studio entirely).

**Progress so far:** Lessons rates/scheduling moved to `/lessons/book` with dedicated tools. About and casting full-page tools remain open risk.

---

## Content tiers

| Tier | Intent | Studio behavior | Examples |
|------|--------|-----------------|----------|
| **A — Flexible** | Evergreen-ish entries the publisher creates/edits often via natural language | Structured Gemini tools that write one markdown file per entry | Shows, news posts, gallery photos |
| **B — Discrete** | Small, typed fields that must stay consistent across UI + SEO | Narrow tools / structured frontmatter (or settings JSON); no freeform page body replace for those fields | Lesson rates on `lessons-book.md`; later: contact email, reel URL, featured-show flags |
| **C — Locked** | Brand-critical copy and layout chrome | Not Gemini-writable; change via PR / design work | Hero copy, nav; **target:** About page, casting bodies (initially); lessons philosophy may stay constrained Tier B/C |

### Policy for current tools

| Tool today | Proposed tier | Status | Action |
|------------|---------------|--------|--------|
| `upsert_show` | A | `done` | Keep |
| `create_news_post` | A | `done` | Keep |
| `add_gallery_photo` | A | `done` | Keep |
| `update_lesson_rates` | B | `done` | Keep; harden ids/`priceAmount` (`FLEX-P2-004`) |
| `update_lesson_scheduling` / `update_lesson_book_seo` | B | `done` | Keep (book page only) |
| `update_lessons_copy` / `update_lessons_seo` | B/C hybrid | `done` (split) | Prefer merge; consider locking copy later if abuse risk |
| `update_about` | C | `planned` | **Remove** from Gemini tools (`FLEX-P1-002`) |
| `create_or_update_casting_page` | C (for now) | `planned` | **Remove** from default Studio tools (`FLEX-P1-003`); keep [add-casting-page.md](../runbooks/add-casting-page.md) |

Casting stays locked initially because it is SEO-sensitive and still a full markdown replace — the same class of risk About had.

---

## Current architecture

### Rates SoT (shipped)

Canonical rates live in **`src/content/pages/lessons-book.md` frontmatter** (`rates[]` with `label`, `price`, optional `priceAmount`). Studio updates them only via `update_lesson_rates` (merge, Zod-validated). Philosophy copy stays on `lessons.md` without dollar amounts.

```text
/lessons          → philosophy (update_lessons_copy / update_lessons_seo)
/lessons/book     → rates + scheduling (update_lesson_rates / update_lesson_scheduling / update_lesson_book_seo)
```

### Original sketch (not used)

`src/data/site-settings.json` was proposed as a shared discrete registry. **Not implemented** — marked `wont_fix` for v1 rates. Reopen only if multiple discrete keys need one file outside content collections.

### Publish-time hardening (remaining)

Today publish still trusts client-edited paths under the broad prefix `src/content/`. Still needed:

1. **Path allowlist by kind**, not only prefix (`FLEX-P1-004`)
2. **Reject** Studio publish of locked paths (`about.md`, casting) once tools are removed
3. Optional: stable rate `id` allowlist + require `priceAmount` (`FLEX-P2-004`)
4. Structured Preview + tool/path pair checks (`FLEX-P4-*`)

---

## Phased backlog

### Phase 1 — Stop the bleed (safety)

| ID | Title | Status | Depends on | Primary refs |
|----|-------|--------|------------|--------------|
| `FLEX-P1-001` | Split lessons tools; remove monolith full-page lessons replace | `done` | — | `api/src/lib/gemini.js`, `/lessons` + `/lessons/book` |
| `FLEX-P1-002` | Remove `update_about` from Gemini tools (About PR-only) | `planned` | — | `gemini.js`, `studioHelp.ts`, refine-studio-gemini |
| `FLEX-P1-003` | Remove `create_or_update_casting_page` from default Studio tools | `planned` | — | `gemini.js`; casting runbook |
| `FLEX-P1-004` | Narrow publish path allowlist by content kind | `planned` | `FLEX-P1-002`, `FLEX-P1-003` | `isAllowedContentPath` / publish handler |
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

- [ ] `update_about` removed from `functionDeclarations` and builders
- [ ] Studio help / refine runbook no longer list About as voice-editable
- [ ] System instruction tells model About changes need a site PR

</details>

<details>
<summary><code>FLEX-P1-003</code> — Remove casting Studio tool</summary>

**Acceptance criteria**

- [ ] `create_or_update_casting_page` removed from default Studio tools
- [ ] [add-casting-page.md](../runbooks/add-casting-page.md) remains the SoT workflow
- [ ] Help/docs updated; revisit only with templated discrete fields later

</details>

<details>
<summary><code>FLEX-P1-004</code> — Path allowlist by kind</summary>

**Acceptance criteria**

- [ ] Studio publish allowlist is by kind (shows/news/gallery + allowed pages), not bare `src/content/`
- [ ] Locked paths (`about.md`, casting, and any other C-tier) rejected even if Preview is hand-edited
- [ ] Book + lessons paths only writable by the tools that own them (or explicit kind list)

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
| `FLEX-P2-004` | Harden rate shape (stable ids + required `priceAmount`) | `planned` | `FLEX-P2-003` | `contentSchemas.js`, normalizeLessonRates |
| `FLEX-P2-005` | Inject current rates into draft catalog context | `planned` | `FLEX-P2-001` | `buildProductionSiteContext` |
| `FLEX-P2-006` | `site-settings.json` shared registry for rates | `wont_fix` | — | Alternate design shipped on book page |
| `FLEX-P2-007` | Smoke: voice rate change → book page only → live UI | `planned` | `FLEX-P2-003` | Studio + `/lessons/book` |

<details>
<summary><code>FLEX-P2-004</code> — Harden rate shape</summary>

**Acceptance criteria**

- [ ] Stable allowlisted ids (e..g. `30min`, `60min`) — reject unknown ids
- [ ] Numeric price field required for JSON-LD / UI (no string-only `$` as sole SoT)
- [ ] Gemini cannot invent a third parallel rate tier without an explicit product decision

</details>

<details>
<summary><code>FLEX-P2-005</code> — Catalog injects live rates</summary>

**Acceptance criteria**

- [ ] Draft context includes current rates (e.g. “60-min is currently $100”)
- [ ] Model patches real values rather than guessing

</details>

---

### Phase 3 — Extend the discrete registry (as needed)

| ID | Title | Status | Depends on | Primary refs |
|----|-------|--------|------------|--------------|
| `FLEX-P3-001` | Discrete registry candidates (offerings, email, reel, bio, casting template) | `planned` | Phase 1–2 residual | Product need |

Add allowlisted keys **only** when there is a clear Studio need, each with validation:

| Candidate | Notes |
|-----------|--------|
| `lessonOfferings` | Only if titles/descriptions should be voice-editable; still not freeform page replace |
| Site email / inquire subject | High impact; validate email format |
| Reel URL | URL validation |
| Featured show toggles | Could stay on `upsert_show` instead |
| About “short bio” field | If About needs Studio later, expose one short string — not full markdown replace |
| Casting | Prefer templated fields (`keyword`, `relatedShows`) with locked body sections, or remain PR-only |

Do **not** grow a general “edit any JSON” tool. Each discrete variable should be intentional.

<details>
<summary><code>FLEX-P3-001</code> — Extend registry</summary>

**Acceptance criteria**

- [ ] Each new field has its own tool (or allowlisted key) + Zod validation
- [ ] No return to full-page replace for About/casting without templates
- [ ] Studio help updated in the same PR

</details>

---

### Phase 4 — Preview & guardrails polish

| ID | Title | Status | Depends on | Primary refs |
|----|-------|--------|------------|--------------|
| `FLEX-P4-001` | Structured Preview for discrete rate changes | `planned` | `FLEX-P2-003` | Studio UI |
| `FLEX-P4-002` | Reject publish when tool / path pair mismatches | `planned` | `FLEX-P1-004` | `updateContent.js` / publish path |
| `FLEX-P4-003` | Optional early Zod/frontmatter check UX for flexible markdown | `planned` | — | Already partial via `validateContentFile` |

<details>
<summary><code>FLEX-P4-001</code> / <code>FLEX-P4-002</code></summary>

**Acceptance criteria**

- [ ] Rate updates show old → new prices in Preview (not only raw markdown/JSON)
- [ ] Server rejects e.g. rates tool writing a non-book path (and inverse)

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
| Publisher still needs occasional About tweaks | Accept PR-only for v1; add a single discrete bio field later if pain is real |
| Casting SEO velocity | Keep runbook; do not re-enable full-page Gemini replace without templates |
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

1. Finish **Phase 1 residual:** `FLEX-P1-002` → `FLEX-P1-003` → `FLEX-P1-004` (lock About/casting + harden allowlist).
2. Harden rates (`FLEX-P2-004`, `FLEX-P2-005`, smoke `FLEX-P2-007`).
3. Treat **Phases 3–4** as follow-ups driven by real publisher needs.
