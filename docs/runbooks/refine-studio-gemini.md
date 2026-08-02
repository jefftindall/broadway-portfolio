# Runbook: Refine Studio Gemini instructions

Studio turns natural-language updates into portfolio markdown via Gemini tool calls in [`api/src/lib/gemini.js`](../../api/src/lib/gemini.js). Use this runbook when drafts are off-tone, pick the wrong content type, invent details, or miss required fields.

## Where instructions live

| Piece | Location | Purpose |
|-------|----------|---------|
| System instruction | `systemInstruction` in `runContentAgent()` | Tone, routing preferences, hard rules (“don’t invent credits”), production site URL |
| Production catalog | Built each draft via `buildProductionSiteContext()` from the GitHub content branch | Live URLs + repo paths so updates reuse existing pages instead of starting blank |
| Tool catalog | `tools` → `functionDeclarations` | Which updates exist and which fields Gemini must fill |
| Model ID | `GEMINI_MODEL` (default `gemini-3.6-flash`) | Capability / cost tradeoff |
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
5. When drafts look right, **Publish to site** on staging and confirm the Done step / live page.
6. Merge to `main` so staging and prod Functions pick up the API change (SWA deploy).

Prefer small prompt edits over large rewrites so you can tell what fixed the behavior.

## Improving routing (wrong page type)

If announcements become show credits (or the reverse), tighten the preference rules in `systemInstruction`, for example:

- Prefer `create_news_post` for press, appearances, and one-off announcements.
- Prefer `upsert_show` only for booking/role/venue credits.
- Prefer `add_gallery_photo` when a photo is attached and she wants the gallery.

Also update the matching tool `description` so it restates when to use that tool.

### Lessons vs book-a-lesson routing

Lessons content is split across two pages:

| Page | URL | Tools |
|------|-----|-------|
| Philosophy & approach | `/lessons` | `update_lessons_copy`, `update_lessons_seo` |
| Rates & scheduling | `/lessons/book` | `update_lesson_rates`, `update_lesson_scheduling`, `update_lesson_book_seo` |

If rate changes land on `lessons.md`, tighten routing: prices belong on `/lessons/book` via `update_lesson_rates` only. Lesson copy builders **merge** into existing markdown (they do not replace unrelated frontmatter or body).

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
- If Gemini pads thin SEO pages, say so under `create_or_update_casting_page` (helpful copy, no keyword stuffing).
- If lessons drafts drift into acting-coach language, re-check the brand facts block in `systemInstruction`.

## Improving missing or wrong fields

When drafts omit `date`, invent slugs poorly, or leave empty `body`:

1. Mark the field `required` in that tool’s `parameters` if it must always be present.
2. Add a short `description` on the property (e.g. `ISO date YYYY-MM-DD`).
3. Optionally mention defaults in the system instruction (e.g. news date defaults to today — the builder already fills today when omitted).

Builders in `buildContentChange()` still apply deterministic defaults (slugs, today’s date, photo path). Lessons and book-page tools **merge** into existing files via `gray-matter` so rates updates do not wipe philosophy copy (and vice versa). Prefer fixing Gemini output when the *copy* is wrong; prefer builder defaults when the value is mechanical.

## Model changes

Set `GEMINI_MODEL` in SWA app settings (via Key Vault sync / Terraform) if you need a different Google model. Do not reinstate shut-down IDs such as `gemini-2.0-flash`. After changing the model, re-run the draft loop above — tool-calling behavior can shift.

## Observability

Failed drafts/publishes emit `StudioDraftFailed` / `StudioPublishFailed` with `correlationId` (see [observability](./observability.md)). Gemini’s own traces stay in Google AI Studio / the provider console — App Insights only sees coarse `errorKind` values (`gemini`, `gemini_quota`, etc.).

## Checklist before shipping a prompt change

- [ ] Draft mode returns the expected tool and usable markdown
- [ ] No secrets, HTTP rules, or support IDs in `systemInstruction`
- [ ] Staging Studio Preview + Publish smoke test
- [ ] `npm run lint` before commit
