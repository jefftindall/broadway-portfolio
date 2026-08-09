# Runbook: Add a casting page

## Create a new lander (hand / PR)

Studio does **not** create new casting pages. Add them by hand (or PR), then use Studio later to tweak fields.

1. Add `src/content/casting/my-keyword.md` with frontmatter:

```yaml
---
keyword: my search phrase
title: Human Title
description: One-sentence SEO description.
relatedSkills:
  - Musical theatre
relatedShows:
  - Anastasia
cta: Request materials
---

Write 2–4 useful paragraphs. Link naturally inside the body only.
```

**Title contract:** Pass a bare `title` (no `| Elyse Tindall` and no ` · Elyse Tindall`). `BaseLayout` appends the brand suffix, so the document title becomes `Human Title · Elyse Tindall`. Do not embed the brand in frontmatter.

**Layout contract:** `LandingLayout` renders body markdown, then the **Related credits** block (from `relatedShows`) and stops. Do **not** add CTAs, “browse casting pages”, Materials links, or any other content below Related credits — the shared footer already owns Materials / Contact / Lessons.

2. Commit and push to `main`
3. Verify `/for/my-keyword` and that it appears in `sitemap-index.xml`

## Update fields via Studio (existing pages only)

After the lander exists, sign in to `/studio` and say something like:

> Change the CTA on my musical theatre actress page to Request materials.

> Add Anastasia to related shows on my musical theatre actress casting page.

Gemini calls `update_casting_fields` and merges frontmatter only — body copy stays as written. Preview shows labeled fields (keyword, title, description, CTA, related shows/skills).

## Quality bar

No thin doorway pages — each page needs unique, accurate copy tied to real credits.
