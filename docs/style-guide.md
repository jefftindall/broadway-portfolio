# Brand & UI style guide

Living visual reference: [`/style-guide`](../src/pages/style-guide.astro) (local: `http://localhost:4321/style-guide`). Not linked in public nav; excluded from the sitemap.

Tokens and utilities live in [`src/styles/global.css`](../src/styles/global.css). Brand constants live in [`src/lib/site.ts`](../src/lib/site.ts).

## Brand positioning

| Element | Value |
|---------|--------|
| Name | Elyse Tindall |
| Role | Musical Theatre Actress & Vocal Coach |
| Narrative | Atlanta to New York |
| Contact | Email from Key Vault / `.env` (`SITE_CONTACT_EMAIL`) — not stored in git. Phone is resume PDF only (`SITE_CONTACT_PHONE` / resume-meta fallback), not shown on the public site. |
| Tone | Warm, editorial, confident — Broadway glamour without cold luxury |

Do not use outdated biographical framing (e.g. age-focused teen copy). Chronological age may appear as a casting fact (derived at build from `SITE_DATE_OF_BIRTH` in Key Vault / local `.env`); never publish the date of birth. Lessons and performance share equal brand weight.

**Teaching (lessons only):** private **voice** lessons — vocal pedagogy, vocal health, CCM. Do not advertise acting lessons.

## Visual direction

**Modern editorial NYC glamour meets Broadway warmth.**

- Dark stage backgrounds with warm gold accents and a teal “gel” secondary
- Cormorant Garamond (display) + Figtree (body)
- Subtle glass panels (`backdrop-blur`), not heavy card chrome
- Generous spacing; one job per section
- Full-bleed photography in heroes; no floating badge clutter on media

Avoid: purple gradients, cream newspaper layouts, pill-stat strips, multi-layer neon glow.

## Color tokens

| Token | Hex / value | Tailwind | Use |
|-------|-------------|----------|-----|
| `ink` | `#0e0d0c` | `bg-ink` / `text-ink` | Page base, text on gold |
| `stage` | `#1a1612` | `bg-stage` | Gradient end / hover surfaces |
| `panel` | `#241f1a` | `bg-panel` | Solid panels, media backs |
| `spotlight` | `#f3ebe0` | `text-spotlight` | Primary text / headings |
| `muted` | `#b8a99a` | `text-muted` | Supporting copy |
| `gold` | `#c4a35a` | `bg-gold` / `text-gold` | Primary CTA, accents |
| `gel` | `#3d8b8b` | `text-gel` / `bg-gel` | Eyebrows, secondary CTA, links |
| `line` | `rgba(243,235,224,0.14)` | `border-line` | Hairline borders |
| `glass` | `rgba(26,22,18,0.55)` | `.glass-panel` | Translucent surfaces |
| `glass-strong` | `rgba(36,31,26,0.72)` | `.glass-panel-strong` | Stronger glass |

Contrast rule: primary CTAs use **gold on ink**. Muted text is secondary only.

## Typography

| Role | Font | Typical scale |
|------|------|----------------|
| Brand / H1 | Cormorant Garamond (`font-display`) | `text-5xl`–`text-8xl`, leading ~0.92–0.95 |
| Section titles | Cormorant Garamond | `text-4xl`–`text-5xl` |
| Body | Figtree (`font-sans`) | `text-base` / `text-lg`, `text-muted` |
| Eyebrow | Figtree uppercase | `text-sm tracking-[0.25em] text-gel` or `text-gold` |
| Prose | `.prose-site` | max-width ~42rem, gel underlines |

## Layout & spacing

- Content width: `max-w-6xl` + `px-6`
- Section rhythm: `.section-y` (4rem / 5.5rem at `md`)
- Radius: `rounded-sm` (not pills)
- Tap targets: `min-h-11` (44px+)
- Mobile galleries: `.scroll-x` snap carousel

## Components

| Component | Path | When to use |
|-----------|------|-------------|
| `Hero` | `src/components/Hero.astro` | Homepage full-bleed brand entry only |
| `SectionHeader` | `src/components/SectionHeader.astro` | Section eyebrow + title + one support line |
| `CtaLink` | `src/components/CtaLink.astro` | Primary / secondary / gel actions |
| `GlassPanel` | `src/components/GlassPanel.astro` | Interactive modules (lessons, contact, rates) |
| `LessonsModule` | `src/components/LessonsModule.astro` | Flagship private voice / vocal coaching block |
| `ContactLanes` | `src/components/ContactLanes.astro` | Casting vs lesson lanes (forms on `/contact`; links elsewhere) |
| `InquiryForm` | `src/components/InquiryForm.astro` | Live casting / lesson forms → `POST /api/contactInquiry` |
| `ShowCard` / `CreditList` | `src/components/` | Credits; filters by `category` |
| `MediaCard` | `src/components/MediaCard.astro` | Gallery / media thumbnails |
| `VideoEmbed` | `src/components/VideoEmbed.astro` | YouTube / Vimeo reel embeds |
| `LessonCta` | `src/components/LessonCta.astro` | Compact “Study with Elyse” embed |

### CTA variants (`CtaLink`)

- **primary** — gold fill → ink text (default conversion action)
- **secondary** — outline / line border (alternate action)
- **gel** — teal fill (supporting emphasis, e.g. lessons teaser)

Inquiry email subjects (set server-side by the contact API): `Casting Inquiry`, `Lesson Inquiry`. Primary CTAs use on-site forms (not mailto). Footer may keep a bare mailto escape hatch.

## Motion

Use sparingly for presence:

- `.fade-up`, `.fade-up-delay`, `.fade-up-delay-2` on hero/entry content
- Image hover scale on `MediaCard` only
- Prefer CSS; avoid noisy looping animation

## Imagery

- Prefer real photos under `public/images/photos/`, `gallery/`, `shows/`
- Hero: `site.heroImage` (portrait, object-top / upper crop)
- Reel poster + `site.reelUrl` for performance embeds
- Lessons atmosphere: `/images/lessons/lessons-banner.jpg`
- OG default: `/images/og-default.jpg`
- Always set meaningful `alt` (decorative images: empty `alt` + `aria-hidden` when appropriate)

## Accessibility

- Skip link to `#main` in `BaseLayout`
- `:focus-visible` gold outline
- Semantic landmarks and one clear `h1` per page
- iframe embeds need a descriptive `title`
- Do not rely on color alone for filters (`aria-selected` on tabs)

## SEO / schema notes

- Default `Person` in `Seo.astro` (jobTitle, knowsAbout, sameAs Instagram)
- Home: `Person` + `WebSite` (+ `VideoObject` for reel)
- Lessons: `EducationalOrganization` + `Offer`s
- Shows: `VideoObject` for cabaret reel

## Do / don’t

**Do**

- Lead with the brand name at hero scale
- Pair Book a Lesson + Watch Reel (or casting) as dual CTAs
- Give lessons equal visual weight to performance
- Keep sections to one headline + short support

**Don’t**

- Introduce a second typeface or accent palette without updating tokens
- Use placeholder SVGs on public pages
- Overload the first viewport with news, stats, or schedules
- Put detached promo badges over hero photography
