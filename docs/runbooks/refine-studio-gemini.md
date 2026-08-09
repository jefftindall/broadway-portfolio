# Runbook: Refine Studio Gemini instructions

Studio turns natural-language updates into portfolio markdown via Gemini tool calls in [`api/src/lib/gemini.js`](../../api/src/lib/gemini.js). Use this runbook when drafts are off-tone, pick the wrong content type, invent details, or miss required fields.

## Where instructions live

| Piece | Location | Purpose |
|-------|----------|---------|
| System instruction | `systemInstruction` in `runContentAgent()` | Tone, routing preferences, hard rules (“don’t invent credits”), production site URL |
| Production catalog | Built each draft via `buildProductionSiteContext()` from the GitHub content branch | Live URLs + repo paths so updates reuse existing pages instead of starting blank |
| Tool catalog | `tools` → `functionDeclarations` | Which updates exist and which fields Gemini must fill |
| Model ID (Studio) | `GEMINI_MODEL` (default `gemini-3.6-flash`) | Capability / cost tradeoff |
| Model ID (search ops) | `GEMINI_MODEL_SEARCH_OPS` (default `gemini-3.5-flash`) | Independent RPM/RPD from Studio; lander drafts only |
| Site URL | `SITE_URL` or `PUBLIC_SITE_URL` (default `https://elysetindall.com`) | Canonical production reference in prompts |
| User-facing HTTP errors | [`api/src/lib/httpErrors.js`](../../api/src/lib/httpErrors.js) + Studio UI | Friendly copy + `correlationId` — **not** for the model prompt |

Do **not** put HTTP status codes, correlation IDs, Key Vault names, or App Insights event names into `systemInstruction`. Those belong in API/UI error handling ([studio errors](../../.cursor/rules/studio-errors.mdc)).

## Production site context

Every draft loads a catalog from the GitHub content branch (`buildProductionSiteContext`): titles/labels plus live URLs under `https://elysetindall.com` (override with `SITE_URL`). The system instruction tells Gemini to reuse existing slugs and align facts with that catalog so updates are edits to the live site, not from-scratch pages.

If drafts ignore existing shows/news, check GitHub App Contents access and that `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_BRANCH` point at the portfolio repo. Catalog load failures are non-fatal (draft still runs with a short fallback note).

## Safe iteration loop

1. Change `systemInstruction` and/or a tool `description` / `parameters` in `gemini.js`.
2. Run the API locally (`func start` in `api/`) or deploy to staging.
3. Open Studio → **Preview update** (`mode: draft`). This calls Gemini and returns proposed files **without** committing.
4. Read the draft path, frontmatter, and body. Edit locally in Preview only to sanity-check; then refine the prompt/tools if Gemini should have produced better output.
5. When drafts look right, **Publish to site** (prod) or **Publish to staging branch** (staging Studio). Publish writes **one git commit** for all files in the update (e.g. gallery image + markdown together), so CD runs once. Commit messages use a `studio: <tool> <file>` subject plus a body listing paths and key params. Speak/type + attach and hub Gallery share that same publish path. On staging, confirm the Done step shows the dated branch + pull request; use Actions → **Staging branch** to deploy that branch for smoke. On prod, confirm Done / live page as usual.
6. Merge to `main` so staging and prod Functions pick up the API change (SWA deploy). Staging content PRs are separate from API code merges.

Prefer small prompt edits over large rewrites so you can tell what fixed the behavior.

## Improving routing (wrong page type)

If announcements become show credits (or the reverse), tighten the preference rules in `systemInstruction`, for example:

- Prefer `create_news_post` for press, appearances, and one-off announcements.
- Prefer `upsert_show` only for booking/role/venue credits.
- Prefer `add_gallery_photo` when a photo is attached and she wants the gallery (or use the Studio hub **Gallery photo** form — same tool, no Gemini draft).

Also update the matching tool `description` so it restates when to use that tool.

### Lessons vs book-a-lesson routing

Lessons content is split across two pages:

| Page | URL | Tools |
|------|-----|-------|
| Philosophy & approach | `/lessons` | `update_lessons_copy`, `update_lessons_seo` |
| Rates & scheduling | `/lessons/book` | `update_lesson_rates`, `update_lesson_scheduling`, `update_lesson_book_seo` |

If rate changes land on `lessons.md`, tighten routing: prices belong on `/lessons/book` via `update_lesson_rates` only. Lesson copy builders **merge** into existing markdown (they do not replace unrelated frontmatter or body). Rates require stable ids `30min` / `60min` and numeric `priceAmount`.

### Discrete site settings (reel, bio, performer facts)

Canonical values live in [`src/data/site-settings.json`](../../src/data/site-settings.json) (re-exported by `src/lib/site.ts`). Studio tools:

| Tool | Updates |
|------|---------|
| `update_reel_url` | Reel link on Materials / Shows / home |
| `update_performer_facts` | Casting facts on About + Materials |
| `update_short_bio` | About lead paragraph only (full About body is PR-only) |
| `update_press_quote` | Homepage press quote + attribution under the hero |
| `update_casting_fields` | Frontmatter on an **existing** `/for/…` page (no create, no body rewrite). Lander chrome ends at **Related credits** — never add CTAs / Materials / casting-index links below that block. |

Publish allowlist is kind-scoped: shows/news/gallery/lessons/book/casting + exact `site-settings.json`. `about.md` is not Studio-writable.

**Current-values rule:** Discrete updates (rates, reel, short bio, press quote, performer facts) must ground tool args in live catalog lines (`Lesson rates (live)`, `Reel URL (live)`, `Short bio (live)`, `Press quote (live)`, `Performer facts (live)`). Never blank a field or invent a parallel value when the catalog already shows the current one. Studio hub editors prefill those live values; discrete Preview is a **read-only site-style confirmation** (reel embed, rates block, performer facts block, press quote — edit on the prior step, then publish).

Studio Preview shows labeled fields for discrete tools (dollar inputs for rates). Publishers pick a hub destination (Speak or type, Gallery photo, Rates, Facts, Reel, Short bio, Press quote) instead of scrolling one long form. **Gallery photo** is a structured hub flow for Tier A `add_gallery_photo` (required image + tags/focus; sort order is automatic so newest photos appear first) with a tile Preview; Speak or type + attach still works for the same tool. Selecting a photo whose SHA-256 matches an existing file under `public/images/gallery/` or `public/images/photos/` shows a warn-only duplicate banner (and a confirm before Preview).

## Brand facts for teaching copy

Keep these in `systemInstruction` (and the lessons tool descriptions):

- Elyse teaches as a **vocal coach only** — private voice lessons.
- Strengths to reflect: **vocal pedagogy**, **vocal health**, **contemporary commercial music (CCM)**.
- **Never** advertise acting lessons, monologue coaching, scene study, or acting-through-song as lesson offerings.
- Audition **song** prep is fine when framed as singing/vocal work.
- Performance/acting craft may appear on About or casting pages as artist biography — not as lesson marketing.

## Improving tone and accuracy

- Keep “professional, warm, accurate” (or replace with clearer brand language).
- Keep **Do not invent fake credits** (and similar) as explicit rules.
- If Gemini pads thin SEO pages, say so under casting field tools (helpful copy, no keyword stuffing) — new landers are hand/PR only (`update_casting_fields` does not create pages). Do not add footer-style CTAs or Materials / casting-index links below the Related credits section in `LandingLayout`.
- If lessons drafts drift into acting-coach language, re-check the brand facts block in `systemInstruction`.
- About full-page rewrites are removed; use `update_short_bio` for the lead only.

## Improving missing or wrong fields

When drafts omit `date`, invent slugs poorly, or leave empty `body`:

1. Mark the field `required` in that tool’s `parameters` if it must always be present.
2. Add a short `description` on the property (e.g. `ISO date YYYY-MM-DD`).
3. Optionally mention defaults in the system instruction (e.g. news date defaults to today — the builder already fills today when omitted).

### Show venue format

`upsert_show.venue` (and resume PDF right column) should be **`[Theater Name] - [City], [ST]`** only — e.g. `Alliance Theatre - Atlanta, GA`. Room names, galleries, program tags, and co-producers belong in synopsis/body. Keep that rule in the tool property description and in `systemInstruction`.

Builders in `buildContentChange()` still apply deterministic defaults (slugs, today’s date, photo path). Lessons and book-page tools **merge** into existing files via `gray-matter` so rates updates do not wipe philosophy copy (and vice versa). Before draft or publish, `validateContentFile()` checks frontmatter against the shared Zod schemas in [`api/src/lib/contentSchemas.js`](../../api/src/lib/contentSchemas.js) (same rules as `astro check`). Schemas must live under `api/` so SWA deploy includes them. Invalid drafts return a friendly 400 with `correlationId` — not a raw Zod dump. Prefer fixing Gemini output when the *copy* is wrong; prefer builder defaults when the value is mechanical.

## Model changes

Set `GEMINI_MODEL` in SWA app settings (via Key Vault sync / Terraform) if you need a different Google model for **Studio**. Search-ops / `/for/` draft automation must use **`GEMINI_MODEL_SEARCH_OPS`** (default `gemini-3.5-flash`) so quotas stay independent of Studio’s 3.6 Flash pool — see [cost-and-quotas.md](cost-and-quotas.md). Do not reinstate shut-down IDs such as `gemini-2.0-flash`. After changing the Studio model, re-run the draft loop above — tool-calling behavior can shift.

## Observability

Failed drafts/publishes emit `StudioDraftFailed` / `StudioPublishFailed` with `correlationId` (see [observability](./observability.md)). Gemini’s own traces stay in Google AI Studio / the provider console — App Insights only sees coarse `errorKind` values (`gemini`, `gemini_quota`, etc.).

## Checklist before shipping a prompt change

- [ ] Draft mode returns the expected tool and usable markdown / settings
- [ ] No secrets, HTTP rules, or support IDs in `systemInstruction`
- [ ] **Studio help stays accurate** — update [`src/lib/studioHelp.ts`](../../src/lib/studioHelp.ts) (and `/studio/help` copy/screenshots if UX changed) so discrete prompts and capabilities match the tools you just edited
- [ ] Every new tool has **≥2 example prompts** in `studioHelp.ts` (performer facts: one prompt per editable field)
- [ ] Staging Studio Preview + Publish smoke test (rates Quick edit + structured Preview)
- [ ] `npm run lint` and `npm run test:api-flex` before commit

## User-facing Studio help

Publishers (and signed-in users who cannot publish yet) read **`/studio/help`**, fed by `studioHelp.ts`. That catalog is the checklist for “what can she say?” — keep it aligned whenever `functionDeclarations` or routing rules change. Device-specific mic steps and screenshots use **iPhone 17 · Safari** as the reference. See [`.cursor/rules/studio-help.mdc`](../../.cursor/rules/studio-help.mdc).
