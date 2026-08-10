# Casting language candidates (`DISC-P4-007`)

Ranked **evergreen** `/for/*` intent candidates from the Broadway casting-language catalog (plus optional allowlisted public RSS type-phrase boosts). **No Gemini.** **No casting-board scrapes.**

| File | Role |
|------|------|
| `latest.json` / `latest.md` | Current SoT for draft-PR handoff (`DISC-P4-004` / `DISC-P4-001`) |
| `YYYY-MM-DD.json` / `.md` | Dated snapshot |

**Not this artifact:** site-demand GSC/GA queries live under [`../search-signals/`](../search-signals/) (`SEARCH-P4-002`) — feedback after pages ship, not the Broadway keyword mine.

**Privacy:** slugs, keywords, fit scores, volume numbers, truncated news titles only — no emails, PEMs, or proprietary breakdown dumps.

**Scheduled:** `.github/workflows/search-ops-monthly.yml` (1st of month, 13:00 UTC) runs `npm`-equivalent `node scripts/casting-language-discover.mjs --fetch-news` after GSC/GA extract and commits `docs/ops/casting-language/` alongside search signals (CD paths-ignored).

## Produce locally

```bash
# Catalog + fit/dedupe only (default)
npm run casting:discover

# With RSS fixture + optional Keyword Planner volume file
npm run casting:discover:fixture

# Live allowlisted RSS (Playbill / BroadwayWorld when reachable) — same as monthly CI
npm run casting:discover -- --fetch-news

# Frontmatter-only stubs for human / future Gemini body fill
npm run casting:discover -- --write-stubs=tmp-casting-stubs
```

Tests: `npm run test:casting-language`

## Catalog sources

| Path | Purpose |
|------|---------|
| [`src/data/casting-intent-catalog.json`](../../../src/data/casting-intent-catalog.json) | Human-editable Broadway CD vernacular seeds |
| [`src/data/casting-news-allowlist.json`](../../../src/data/casting-news-allowlist.json) | Public RSS allowlist + reject patterns |

Licensed Actors Access / Backstage ingest is **`DISC-P4-008`** (later). Unlicensed HTML scrape remains `wont_do`.

## Winner contract (for `DISC-P4-004`)

Each winner includes: `slug`, `keyword`, `title`, `fitScore`, `relatedShows`, `relatedSkills`, optional `volume` / `newsBoost`. Body generation stays on `GEMINI_MODEL_SEARCH_OPS` with G-PR — this job never opens a PR by itself.
