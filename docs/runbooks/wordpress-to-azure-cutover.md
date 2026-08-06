# Runbook: WordPress (Namecheap EasyWP) → Azure cutover

Move `elysetindall.com` from Namecheap **EasyWP** to the Astro site on Azure Static Web Apps (SWA) without leaving dead links for users or crawlers.

Related: [DNS and domain](dns-and-domain.md), [Deploy and rollback](deploy-and-rollback.md), [Casting discoverability](../casting-discoverability.md) (`DISC-P0-001`–`003`).

## Current stack (source)

| Piece | Provider |
|-------|----------|
| Domain registration | Namecheap |
| DNS | Namecheap Advanced DNS (BasicDNS nameservers) |
| WordPress host | Namecheap EasyWP |
| Target host | Azure Static Web Apps prod (`swa-elyse-portfolio-prod`) |
| Canonical site | `https://elysetindall.com` |

Email (`elyse.tindall@gmail.com`) must stay unaffected — **do not change MX or email-related TXT** (SPF/DKIM) during cutover.

---

## 1. Preflight

- [ ] Prod SWA default hostname serves the Astro build (`https://<swa>.azurestaticapps.net/`)
- [ ] Custom domain TXT validation is ready or already Ready in Portal / Terraform (`custom_domain_validation_token` — see [dns-and-domain](dns-and-domain.md))
- [ ] Legacy **301 redirects** are in [`public/staticwebapp.config.json`](../../public/staticwebapp.config.json) and deployed through staging → smoke → prod ([deploy-and-rollback](deploy-and-rollback.md))
- [ ] Staging smoke is green for the redirect-bearing build
- [ ] Confirm DNS host: Namecheap → Domain List → **Manage** → Nameservers = **Namecheap BasicDNS** (not Custom DNS). Advanced DNS HOST RECORDS only appear under BasicDNS.
- [ ] **Export rollback DNS**: screenshot or copy every EasyWP-related HOST RECORD (`@` ALIAS/A, `www`, any EasyWP CNAMEs). Keep EasyWP **running** until the rollback window closes.

Optional TTL prep: if Namecheap allows a custom TTL on apex/`www`, set it low (e.g. 5–15 min) a day before flip, then raise it after cutover.

---

## 2. Inventory refresh (before flip)

Re-check live WordPress URLs so the redirect map is still complete:

```bash
curl -s "https://elysetindall.com/wp-json/wp/v2/pages?per_page=100&_fields=link,slug,status" | jq .
curl -s "https://elysetindall.com/wp-json/wp/v2/posts?per_page=100&_fields=link,slug,status" | jq .
```

Also pull indexed URLs from Google Search Console (Pages) or a `site:elysetindall.com` search. Any new path must get a one-hop 301 in `public/staticwebapp.config.json` **before** DNS flip (merge → staging smoke → prod).

### Frozen map (2026-08-02 EasyWP inventory)

Destinations are slashless to match Astro canonicals. Azure SWA treats `/path` and `/path/` as the **same** route key — list each legacy path only once (slashless preferred). Do not add both forms or deploy validation fails with a duplicate-route error.

| Legacy WordPress path | Astro target |
|-----------------------|--------------|
| `/about-me/`, `/about/` | `/about` |
| `/contact/` | `/contact` |
| `/lessons/`, `/lessons/voice-and-vocal-lessons/`, `/lessons/audition-preparation/`, `/lessons/acting-lessons/` | `/lessons` |
| `/news/` | `/news` |
| `/elyse-tindall-shines-as-lily-in-anastasia-at-the-strand-theater/` | `/news/anastasia-strand-2025` |
| `/elyse-tindall-has-just-completed-a-broadway-artists-alliance-musical-theatre-intensive-in-new-york-city/` | `/news/baa-intensive-2024` |
| `/showreel/` | `/materials` |
| `/filmography/` | `/shows` |
| `/looking-for/`, `/looking-for/*` | `/for/available-casting-nyc` |
| `/privacy-policy/` | `/` |
| `/category/*`, `/2024/*`, `/2025/*` | `/news` |
| Attachment / media permalinks (home & about attachment trees) | `/gallery` |

Notes:

- `/lessons/acting-lessons/` maps to `/lessons` on purpose (voice lessons only; do not recreate acting-lesson marketing).
- Astro has **no** `/shows/{slug}` or `/gallery/{slug}` detail routes — map show/filmography/media to list pages.
- WordPress `?p=` shortlinks are not redirected (query-string matching is limited on SWA); they become rare after cutover.

---

## 3. Redirect rules (repo)

Rules live in [`public/staticwebapp.config.json`](../../public/staticwebapp.config.json) (copied into `dist/` on build). Keep the same redirect block mirrored in root [`staticwebapp.config.json`](../../staticwebapp.config.json) so auth + redirects stay aligned.

Requirements:

- Status `301`
- One hop only (never A → B → C)
- One rule per path: SWA rejects `/path` + `/path/` as duplicates (both match the same request)
- Redirect routes listed **before** `/studio` and `/api/*` auth routes

After editing, merge to `main` and wait for Deploy Staging → Smoke Staging → Deploy Production before flipping DNS.

---

## 4. Namecheap DNS cutover

Official Azure guidance: [apex domain (external DNS)](https://learn.microsoft.com/azure/static-web-apps/apex-domain-external), [www / subdomain](https://learn.microsoft.com/azure/static-web-apps/custom-domain-external).

### 4a. Values to copy from Azure

1. Portal → Static Web App **prod** → Overview → copy default hostname (`*.azurestaticapps.net`), strip `https://`.
2. Overview → **JSON View** → copy `stableInboundIP` (needed only if using an `A` record).
3. Confirm custom domain `elysetindall.com` validation is Ready (Terraform TXT or Portal-generated code). For zero-downtime validation while EasyWP still serves apex, prefer a `_dnsauth` host as documented in [Azure custom domain zero-downtime notes](https://learn.microsoft.com/azure/static-web-apps/custom-domain#about-domains) / [dns-and-domain](dns-and-domain.md).

### 4b. Edit Namecheap Advanced DNS

Namecheap → Domain List → `elysetindall.com` → **Manage** → **Advanced DNS** → HOST RECORDS.

1. **Do not** edit MX or email TXT records.
2. Ensure Azure validation TXT is present (`@` or `_dnsauth` as Azure instructed).
3. Remove EasyWP apex records (`@` ALIAS or A pointing at EasyWP / `63.250.43.x`).
4. Point apex to SWA (prefer Namecheap **ALIAS** for global SWA distribution):

   | Type | Host | Value |
   |------|------|-------|
   | ALIAS | `@` | `<swa-default-hostname>.azurestaticapps.net` |

   If ALIAS to SWA fails validation in Namecheap, use Azure’s documented **A** record instead:

   | Type | Host | Value |
   |------|------|-------|
   | A | `@` | `stableInboundIP` from Portal JSON View |

5. Point `www` off EasyWP:

   | Type | Host | Value |
   |------|------|-------|
   | CNAME | `www` | `<swa-default-hostname>.azurestaticapps.net` |

   Then add `www.elysetindall.com` as a custom domain on the SWA (Portal or later Terraform) so TLS works. Optional follow-up: configure www → apex redirect once both hostnames are bound.

6. Save. Propagation is often minutes; allow up to 48–72 hours in the worst case.

---

## 5. Verify

Expect Astro (no `wp-json` link headers). Legacy paths should `301` then land on a `200`.

```bash
# Homepage is Astro, not WordPress
curl -sI https://elysetindall.com/ | head -20

# Core routes
curl -sI https://elysetindall.com/shows | head -5
curl -sI https://elysetindall.com/for/musical-theatre-actress-nyc | head -5
curl -sI https://elysetindall.com/sitemap-index.xml | head -5
curl -sI https://elysetindall.com/robots.txt | head -5

# Legacy → new (spot-check; expect 301)
curl -sI https://elysetindall.com/about-me/ | head -10
curl -sI https://elysetindall.com/about/ | head -10
curl -sI https://elysetindall.com/showreel/ | head -10
curl -sI https://elysetindall.com/filmography/ | head -10
curl -sI https://elysetindall.com/elyse-tindall-shines-as-lily-in-anastasia-at-the-strand-theater/ | head -10
curl -sI https://elysetindall.com/elyse-tindall-has-just-completed-a-broadway-artists-alliance-musical-theatre-intensive-in-new-york-city/ | head -10
curl -sI https://elysetindall.com/looking-for/ | head -10
curl -sI https://elysetindall.com/lessons/acting-lessons/ | head -10
curl -sI https://elysetindall.com/privacy-policy/ | head -10
```

Also check:

- [ ] Browser: home, `/shows`, `/materials`, `/lessons`, one `/for/...`, `/news/...`
- [ ] Studio: `https://elysetindall.com/studio` → Entra login still works
- [ ] Send a test email to `elyse.tindall@gmail.com` if MX/TXT were present and untouched
- [ ] `www` resolves to SWA (or redirects) once that hostname is bound

---

## 6. Search consoles (`DISC-P0-002`)

After apex serves Astro:

- [ ] Google Search Console property for `elysetindall.com` verified
- [ ] Submit `https://elysetindall.com/sitemap-index.xml`
- [ ] Request indexing for `/`, `/materials`, `/shows`, and key `/for/...` pages
- [ ] Bing Webmaster Tools: submit the same sitemap (recommended)
- [ ] Monitor index coverage for `/for/*` for ~2 weeks; fix any surprise 404s with new 301s
- [ ] Link GA4 ↔ GSC and continue phased work per [search-and-analytics.md](../plans/search-and-analytics.md) (`SEARCH-P0-*`)

---

## 7. Decommission EasyWP

Only after **≥ 48 hours** of healthy Astro serving and a successful rollback window:

- [ ] Namecheap → Account → **Hosting List** → cancel / remove the EasyWP subscription
- [ ] Keep Namecheap **domain registration** active
- [ ] Confirm no leftover EasyWP ALIAS/CNAME records remain in Advanced DNS
- [ ] Optional: export a final EasyWP backup (files/DB) before cancel if you want an archive

Do **not** cancel EasyWP before you are willing to lose instant DNS rollback to WordPress.

---

## 8. Rollback

If Astro is wrong or DNS/TLS is broken:

1. Namecheap Advanced DNS → restore the **preflight** EasyWP `@` and `www` records exactly.
2. Wait for propagation; confirm `curl -sI https://elysetindall.com/` shows WordPress again (`wp-json` link header).
3. Leave SWA and redirects in place; fix the issue; re-attempt cutover from Preflight.

Rollback requires EasyWP still provisioned and those old records still valid.

---

## Checklist summary

- [ ] Redirects deployed to prod SWA
- [ ] Namecheap DNS exported for rollback
- [ ] Apex (+ `www`) points to SWA; EasyWP no longer receives public apex traffic
- [ ] HTTPS works on apex
- [ ] Legacy URL spot-checks return 301 → 200
- [ ] Sitemap + robots OK; search consoles updated
- [ ] Email unaffected
- [ ] EasyWP cancelled only after rollback window
