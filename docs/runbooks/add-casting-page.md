# Runbook: Add a casting page

## Via Studio (preferred)

Sign in to `/studio` and say something like:

> Create a casting page for “musical theatre actress Brooklyn” with helpful copy about my NYC training and Anastasia credit.

Gemini will call `create_or_update_casting_page` and commit `src/content/casting/<slug>.md`. After deploy, the page is at `/for/<slug>` and included in the sitemap.

## By hand

1. Add `src/content/casting/my-keyword.md` with frontmatter:

```yaml
---
keyword: my search phrase
title: Human Title | Elyse Tindall
description: One-sentence SEO description.
relatedSkills:
  - Musical theatre
relatedShows:
  - Anastasia
cta: Request materials
---

Write 2–4 useful paragraphs. Link naturally to shows and contact.
```

2. Commit and push to `main`
3. Verify `/for/my-keyword` and that it appears in `sitemap-index.xml`

## Quality bar

No thin doorway pages — each page needs unique, accurate copy tied to real credits.
