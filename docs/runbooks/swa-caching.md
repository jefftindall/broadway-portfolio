# Runbook: SWA caching

Azure Static Web Apps serves this site. Cache-Control headers live in [`public/staticwebapp.config.json`](../../public/staticwebapp.config.json) (copied to `dist/` on build) and must stay **identical** to root [`staticwebapp.config.json`](../../staticwebapp.config.json), including the Entra `auth` block. Route-specific headers override `globalHeaders`. **401 → login 302s from `responseOverrides` use `globalHeaders` only** (they do not pick up `/studio` route headers), so `globalHeaders.Cache-Control` is `private, no-store` and public HTML cache is an explicit `/*` route listed after `/studio`.

SWA **origin** cache is invalidated automatically on each deploy ([SWA FAQ](https://learn.microsoft.com/azure/static-web-apps/faq#do-i-have-to-manually-purge-or-invalidate-the-cache-after-a-deployment)). These headers control **browser** (and any optional CDN / enterprise-grade edge) reuse of a URL.

## What is cached

| Path | `Cache-Control` | Why |
|------|-----------------|-----|
| HTML and everything without a more specific route (`/`, `/shows`, `/downloads/*`, fonts not under `/_astro`, favicon, …) | `public, must-revalidate, max-age=30` via `/*` | Pages and downloads change in place. After 30s the browser must revalidate. |
| `/studio`, `/studio/*`, `/api/*`, `/api/contactInquiry`, `/api/lessonPayConfig`, unmatched / 401 login 302s | `private, no-store` | Auth-gated, inquiry, and public lesson-pay config responses. A cached 302 to `/.auth/login/aad` replays after Entra returns to `/studio` and loops. 401 overrides inherit `globalHeaders`, not the `/studio` route. |
| `/_astro/*` | `public, max-age=31536000, immutable` | Vite/Astro content-hashes filenames (`Hero.xxxxx.js`). A new build gets a **new URL**. |
| `/images/_derived/*` | `public, max-age=31536000, immutable` | Path is `/images/_derived/{sha256(original)}/{width}.webp`. New original bytes → new SHA → new URL. |
| `/images/*` (originals, not `_derived`) | `public, max-age=604800` (7 days) | Stable public paths (`/images/shows/Ursula.jpg`). Not `immutable` so a later overwrite can refresh after TTL. |

More specific `/images/_derived/*` is listed **before** `/images/*` so first-match routing applies the 1-year policy to derivatives.

## Why normal site updates are not stuck behind cache

Everyday publishes do **not** depend on flushing a long-lived URL:

1. **Copy, layout, and markdown** ship as HTML. Visitors pick up the new page within **30 seconds** (`must-revalidate`), then the HTML points at whatever asset URLs that build used.
2. **JS/CSS** from `npm run build` land under `/_astro/` with a new hash in the filename. Old hashed files may stay in browsers for a year; that is correct — nothing still references them after the HTML updates.
3. **Display images** on cards, gallery, hero, lessons, and the reel facade use `OptimizedImg`, which prefers `_derived/{rawSha}/…`. `images:optimize` keys that folder on the **raw file’s SHA-256**. Replacing an original in git (or Studio committing a new photo / overwriting `reel-poster.jpg`) produces a new SHA, a new derived path, and HTML that points at it after the next deploy. The old derivative can remain cached unused.
4. **Studio photo uploads** write `public/images/photos/{timestamp}-….jpg` — a new path every time — and gallery markdown references that path.
5. **Resume PDF and theatrical headshot** under `/downloads/` inherit the **30s** HTML policy, so materials updates are not held for a week.

The only update that can look “stuck” is **overwriting the same original `/images/…` URL** (same path, new bytes) and then viewing that original URL directly, or a page that still `src`s the original instead of `_derived`. Browsers may keep the old bytes for up to **7 days**. Prefer a new filename (Studio already does this for photos) or wait for TTL. OG/`image:` frontmatter still uses original paths by design; those tags are for crawlers, which re-fetch on their own schedule.

## Diagnose before flushing

```bash
curl -sI https://elysetindall.com/
curl -sI https://elysetindall.com/_astro/
# pick a real hashed file from View Source if needed
curl -sI "https://elysetindall.com/images/shows/Ursula.jpg"
curl -sI "https://elysetindall.com/images/_derived/"
```

Confirm `Cache-Control` matches the table. A private window or another device rules out a single browser. If HTML is already new but an image is old, you are looking at a **stable original path** (7-day) or a local cache — not a failed deploy.

Also confirm CD finished ([deploy-and-rollback.md](deploy-and-rollback.md)) and you are on the custom domain ([dns-and-domain.md](dns-and-domain.md)).

## Flush / recover

Work top-down. You cannot remotely empty **other people’s** browsers except by **changing the URL** they request.

1. **Hard-refresh your own browser** (or a private window). For HTML this is usually enough after 30s.
2. **Wait for TTL** if the stale object is an original under `/images/*` (up to 7 days) and a rename is not worth it.
3. **Change the URL (preferred for a bad original)**  
   - Images: commit a new file name (or let Studio upload) and point markdown at it. Derived variants follow the new SHA.  
   - Code: merge a rebuild so `/_astro/*` hashes change.  
   - Then promote through staging → prod as usual.
4. **Redeploy** if you suspect SWA origin (not the browser) is stale: GitHub → Actions → **CD: main** → Run workflow on `main`. Origin cache is refreshed on deploy; browsers still honor remaining `max-age`.
5. **Enterprise-grade edge purge** — only if that blade is **enabled** on the Static Web App (it is **not** in Terraform today). Portal → Static Web App (`swa-elyse-portfolio-prod` or `-staging`) → **Enterprise-grade edge** → purge. Do not run `az afd endpoint purge` unless a **manual** Front Door profile exists for this app (it does not in this repo).
6. If a visitor still sees an old **immutable** `/_astro/*` or `_derived` file, they are on an old HTML document. Their HTML revalidation (30s) is the fix — not a CDN purge of the hashed asset.

## Related

| Doc | Role |
|-----|------|
| [deploy-and-rollback.md](deploy-and-rollback.md) | Promote / redeploy |
| [troubleshoot-build.md](troubleshoot-build.md) | Studio publish vs live site |
| [dns-and-domain.md](dns-and-domain.md) | Custom domain vs `*.azurestaticapps.net` |
