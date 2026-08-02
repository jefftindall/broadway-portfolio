# Plan: Discrete site variables vs flexible Studio content

## Problem

After the site refresh, Studio (Gemini tool calls → draft → publish → GitHub) can still **fully replace** pages that are no longer meant to be freeform content:

- `update_lessons` replaces all of `src/content/pages/lessons.md`
- `update_about` replaces all of `src/content/pages/about.md`
- `create_or_update_casting_page` can rewrite any casting landing page

Meanwhile, the **authoritative** lesson rates already live in code (`lessonRates` in [`src/lib/site.ts`](../../src/lib/site.ts)), are rendered by the rates panel / homepage module, and are **duplicated** in:

1. Lessons markdown prose (`## Rates & session structure`)
2. Hardcoded JSON-LD `Offer` prices in [`src/pages/lessons.astro`](../../src/pages/lessons.astro)

So a voice update like “raise my 60-minute rate to $120” can overwrite philosophy copy, leave the UI rates panel unchanged, and desync schema.org prices.

**Goal:** Keep Studio strong for **flexible** content (shows, news, gallery), and move everything else to **discrete, validated variables** (or out of Studio entirely).

---

## Content tiers

| Tier | Intent | Studio behavior | Examples |
|------|--------|-----------------|----------|
| **A — Flexible** | Evergreen-ish entries the publisher creates/edits often via natural language | Structured Gemini tools that write one markdown file per entry (current pattern) | Shows, news posts, gallery photos |
| **B — Discrete** | Small, typed fields that must stay consistent across UI + SEO | Narrow tools / structured data files; no freeform page body replace | Lesson rates; later: contact email, reel URL, featured-show flags |
| **C — Locked** | Brand-critical copy and layout chrome | Not Gemini-writable; change via PR / design work | Lessons philosophy & offerings, hero copy, nav, about page (initially), casting pages (initially) |

### Policy for current tools

| Tool today | Proposed tier | Action |
|------------|---------------|--------|
| `upsert_show` | A | Keep |
| `create_news_post` | A | Keep |
| `add_gallery_photo` | A | Keep |
| `update_lessons` | → B only | **Remove** full-body replace; replace with `update_lesson_rates` |
| `update_about` | C | **Remove** from Gemini tools (About becomes PR-only until discrete fields are defined) |
| `create_or_update_casting_page` | C (for now) | **Remove** from default Studio tools; keep the [`docs/runbooks/add-casting-page.md`](../runbooks/add-casting-page.md) PR workflow. Revisit later if SEO pages need a constrained template |

Casting stays locked initially because it is SEO-sensitive and still a full markdown replace — the same class of risk as lessons/about.

---

## Architecture

### Single source of truth for discrete variables

Introduce a small **site settings** data file that Studio may update, instead of editing TypeScript or freeform page markdown:

```text
src/data/site-settings.json
```

Suggested shape (v1 — rates only):

```json
{
  "lessonRates": [
    { "id": "30min", "label": "30-minute session", "priceUsd": 60 },
    { "id": "60min", "label": "60-minute session", "priceUsd": 100 }
  ]
}
```

Rules:

- **Numeric `priceUsd`** is canonical (UI formats as `$60`; JSON-LD uses `60.00`).
- **Stable `id`** values (`30min`, `60min`) so updates change price/label, not invent parallel rate rows.
- Optional later fields live in the same file under explicit keys (email, reelUrl, etc.) — each key gets its own Gemini tool or a single `patch_site_settings` tool with an allowlisted key set.

Load path:

1. `src/lib/site.ts` (or a thin `src/lib/siteSettings.ts`) imports/reads `site-settings.json`.
2. `lessons.astro`, `LessonsModule.astro`, and JSON-LD consume that module only.
3. Lessons markdown **stops listing dollar amounts** (or the rates section is removed from the markdown body entirely so the rates panel is the only presentation).

Why JSON under `src/data/` instead of editing `site.ts` via Gemini?

- Safer to allowlist one path and validate with Zod/JSON Schema at publish time.
- Avoids LLM rewriting TypeScript.
- Fits the existing GitHub Contents commit path (`ALLOWED_PATH_PREFIXES` gains `src/data/`).

### New Gemini tool: `update_lesson_rates`

```text
name: update_lesson_rates
description: Update private voice lesson session prices only. Does not change lessons philosophy, offerings, or page copy.
parameters:
  rates: array of { id: "30min"|"60min", priceUsd: number, label?: string }
required: [rates]
```

Builder behavior:

1. Read current `src/data/site-settings.json` from the content branch (merge, do not invent a blank file).
2. Apply only allowlisted `id`s; reject unknown ids.
3. Validate `priceUsd` is a positive number (and optionally a sane max, e.g. ≤ 500).
4. Emit a single file change for `src/data/site-settings.json`.
5. Summary for Studio: human-readable “30-min → $65, 60-min → $120”.

System instruction change:

- Prefer `update_lesson_rates` when she mentions prices/rates/session length pricing.
- Do **not** offer tools that rewrite `/lessons` or `/about` page bodies.
- Keep brand facts (voice lessons only) for any remaining teaching-adjacent copy in shows/news.

### Publish-time hardening (applies to all tiers)

Today publish trusts client-edited paths under the broad prefix `src/content/`. Tighten as part of this work:

1. **Path allowlist by kind**, not only prefix:
   - Flexible: `src/content/shows|news|gallery/*.md` (+ `public/images/photos/`)
   - Discrete: `src/data/site-settings.json` only (v1)
2. **Schema validate** discrete JSON before commit (Zod in the Functions API).
3. **Reject** publish of `src/content/pages/**` and `src/content/casting/**` from Studio (unless a future discrete tool is added).
4. Keep the Preview editor for flexible markdown; for discrete changes, Preview should show a **structured diff** (old/new prices) rather than a raw JSON dump if feasible — otherwise show JSON but make path non-editable.

---

## Lessons page content split (concrete)

| Surface | Source after change | Who can edit |
|---------|---------------------|--------------|
| Hero eyebrow / title / support | `lessons.astro` (locked) | PR |
| Offerings cards | `lessonOfferings` in `site.ts` (locked for v1; could move to settings later) | PR |
| Philosophy & details prose | `src/content/pages/lessons.md` **without rate bullets** | PR (Studio tool removed) |
| Rates panel | `site-settings.json` → `lessonRates` | Studio via `update_lesson_rates` |
| JSON-LD Offers | Derived from same `priceUsd` | Automatic |
| Meta description mentioning rates | Prefer omit live prices from `lessons.md` frontmatter, or regenerate description from settings at build time | Prefer build-time derivation so meta cannot drift |

Migration for existing `lessons.md`:

1. Delete `## Rates & session structure` (and any `$NN` mentions in description).
2. Keep philosophy / focus areas as evergreen locked copy.
3. Move current `$60` / `$100` into `site-settings.json` and remove hardcodes from `lessons.astro`.

---

## Studio UX implications

Voice / compose examples that should keep working:

- “Add my new show credit for …” → `upsert_show`
- “Post news that …” → `create_news_post`
- “Add this photo to the gallery” → `add_gallery_photo`
- “Change my 60-minute lesson rate to $120” → `update_lesson_rates`

Requests that should **no longer** produce a full page rewrite:

- “Rewrite my lessons page …” → model should only update rates if prices are mentioned; otherwise reply that philosophy/offerings need a site update outside Studio (or no tool call + clear Studio message).
- “Update my about page …” → no tool; publisher uses a PR (document this in Studio empty-state / help copy).

Optional Studio UI affordance (phase 2): a small “Lesson rates” form that POSTs structured rates without going through Gemini — Gemini remains for natural language; the form is a deterministic path for the most common discrete update.

---

## Implementation phases

### Phase 1 — Stop the bleed (safety)

1. Remove `update_lessons`, `update_about`, and `create_or_update_casting_page` from Gemini `functionDeclarations`.
2. Narrow publish path allowlist so Studio cannot commit `src/content/pages/**` or `src/content/casting/**` even if Preview is hand-edited.
3. Update [`docs/runbooks/refine-studio-gemini.md`](../runbooks/refine-studio-gemini.md) and Studio help text to match.
4. Strip rate dollars from `lessons.md` so markdown cannot contradict the rates panel (rates still only in `site.ts` until Phase 2).

**Outcome:** Studio can only touch shows / news / gallery (+ photos). Lessons/about/casting cannot be overwritten via prompts.

### Phase 2 — Discrete rates pipeline

1. Add `src/data/site-settings.json` with current rates.
2. Wire `site.ts` / lessons pages / JSON-LD to that file; delete hardcoded Offer prices.
3. Add `update_lesson_rates` tool + merge/validate builder.
4. Allowlist `src/data/site-settings.json` on publish; Zod-validate payload.
5. Inject current rates into the draft catalog context so Gemini patches real values (“60-min is currently $100”).
6. Smoke-test: draft “set 30-min to $65” → preview shows JSON/settings change only → publish → `/lessons` rates panel + JSON-LD update after rebuild.

### Phase 3 — Extend the discrete registry (as needed)

Add allowlisted keys only when there is a clear Studio need, each with validation:

| Candidate | Notes |
|-----------|--------|
| `lessonOfferings` | Only if titles/descriptions should be voice-editable; still not freeform page replace |
| `site.email` / inquire subject | High impact; validate email format |
| `site.reelUrl` | URL validation |
| `featured` show toggles | Could stay on `upsert_show` instead |
| About “short bio” field | If About needs Studio later, expose one short string field — not full markdown replace |
| Casting | Prefer templated fields (`keyword`, `relatedShows`) with locked body sections, or remain PR-only |

Do **not** grow Phase 2 into a general “edit any JSON” tool. Each discrete variable should be intentional.

### Phase 4 — Preview & guardrails polish

- Structured Preview for discrete tools (table of rate changes).
- Server-side reject if publish `tool` / path pair mismatches (e.g. rates tool may only write settings JSON).
- Optional: run content Zod (or a light frontmatter check) on flexible markdown before commit to catch build-breaking drafts earlier.

---

## Files likely to change (implementation, not this doc)

| Area | Paths |
|------|--------|
| Gemini tools / allowlist / builder | `api/src/lib/gemini.js` |
| Publish handler | `api/src/functions/updateContent.js` |
| Settings data | `src/data/site-settings.json` (new) |
| Consumers | `src/lib/site.ts`, `src/pages/lessons.astro`, `src/components/LessonsModule.astro` |
| Locked copy cleanup | `src/content/pages/lessons.md` |
| Docs / Studio copy | `docs/runbooks/refine-studio-gemini.md`, `src/pages/studio.astro`, `AGENTS.md` (Studio section) |
| Path allowlist for GitHub writes | `isAllowedContentPath` (+ possibly stricter helpers) |

Infra/Terraform: none expected for Phases 1–2.

---

## Risks and decisions

| Risk / decision | Recommendation |
|-----------------|----------------|
| Publisher still needs occasional About tweaks | Accept PR-only for v1; add a single discrete bio field later if pain is real |
| Casting SEO velocity | Keep runbook; do not re-enable full-page Gemini replace without templates |
| Gemini invents a third rate tier | Allowlist ids only; ignore/reject unknown ids |
| Preview path tampering | Enforce path allowlist by content kind at publish |
| Dual formatting (`$60` vs `60.00`) | Store `priceUsd` number once; format at the edge |
| `site-settings.json` commit without rebuild awareness | Same SWA pipeline as markdown; no special case |

---

## Success criteria

1. Natural-language Studio updates can still create/update **shows**, **news**, and **gallery** entries.
2. A rates request updates **only** `src/data/site-settings.json` (or equivalent), and the lessons UI + JSON-LD stay in sync.
3. Studio **cannot** replace `lessons.md`, `about.md`, or casting markdown via Gemini or Preview path edits.
4. Lessons philosophy / offerings are not prompt-overwritable.
5. Docs and Studio copy describe the flexible vs discrete split so publishers know what voice updates can do.

---

## Suggested implementation order

Ship **Phase 1** first (remove dangerous tools + tighten allowlist + de-dupe rates from markdown). Then **Phase 2** to restore rates updates safely through discrete settings. Treat Phases 3–4 as follow-ups driven by real publisher needs.
