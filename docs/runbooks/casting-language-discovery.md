# Runbook: Broadway casting-language discovery

**Action ID:** `DISC-P4-007`  
**Related:** `DISC-P4-001` (catalog fill), `DISC-P4-004` (Gemini draft PR), `DISC-P4-005` (guardrails), `DISC-P4-008` (licensed boards later), `SEARCH-P4-002` (GSC feedback only)  
**Audience:** Jeff (operator); Elyse approves lander copy via G-PR

## What this does

Ranks **evergreen** casting intents that Broadway CDs actually use (fach, type, ethnicity/presenting, geo, archetype) against Elyse’s performer facts and real show credits. Optionally boosts intents when **allowlisted public** casting-news headlines mention the same type phrases.

It does **not**:

- Scrape Actors Access / Backstage (that’s licensed-only `DISC-P4-008`)
- Call Gemini or open a GitHub PR (body draft = `DISC-P4-004`)
- Treat GSC queries as the keyword mine (GSC = feedback after pages ship)

## Inputs

| Input | Path |
|-------|------|
| Seed catalog | [`src/data/casting-intent-catalog.json`](../../src/data/casting-intent-catalog.json) |
| News allowlist | [`src/data/casting-news-allowlist.json`](../../src/data/casting-news-allowlist.json) |
| Performer facts | [`src/data/site-settings.json`](../../src/data/site-settings.json) `performer` |
| Existing landers | `src/content/casting/*.md` |
| Credits | `src/content/shows/*.md` |
| Optional volume file | Keyword Planner-style JSON `{ "keyword": monthlyVolume }` |

Edit the catalog by hand when you learn new CD vernacular. Prefer adding seeds over inventing show-title landers.

## Commands

```bash
npm run casting:discover
npm run casting:discover:fixture   # RSS fixture + sample volumes
npm run casting:discover -- --fetch-news
npm run casting:discover -- --write-stubs=tmp-casting-stubs --max-winners=3
npm run test:casting-language
```

Artifact SoT: [`docs/ops/casting-language/`](../ops/casting-language/).

## Operator loop

1. Run discovery (fixture or `--fetch-news`).
2. Review `latest.md` winners — check fit, evidence shows, near-dupe skips.
3. Open a content PR (hand or future `DISC-P4-004` job) with unique body copy per [add-casting-page.md](add-casting-page.md).
4. After merge, monthly GSC (`SEARCH-P4-002`) measures whether the new `/for/*` earns impressions/CTR.

## Guardrails (shared with `DISC-P4-005`)

- Skip near-duplicate keywords/slugs vs existing landers
- Require fit vs performer tags and at least one real `relatedShows` match
- Evergreen only — drop “this week” / famous-show cast-join headlines
- Never commit proprietary breakdown text or inquiry PII
