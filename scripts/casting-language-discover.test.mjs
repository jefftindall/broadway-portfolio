/**
 * Unit tests for DISC-P4-007 casting-language discovery (no network).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  findNearDuplicate,
  fitScore,
  isEvergreenCandidate,
  isRejectedNewsTitle,
  mapNewsTitleToIntents,
  normalizePhrase,
  parseRssItemTitles,
  performerFitTags,
  tokenJaccard,
} from "./lib/casting-language.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

describe("casting-language helpers", () => {
  it("normalizes and compares phrases", () => {
    assert.equal(normalizePhrase("Ingénue Actress!"), "ingenue actress");
    assert.ok(tokenJaccard("latina musical theatre actress", "latina musical theatre actress") === 1);
    assert.ok(tokenJaccard("mezzo soprano", "bass baritone") < 0.3);
  });

  it("detects near-duplicates vs existing landers", () => {
    const existing = [
      { slug: "mezzo-soprano-musical-theatre", keyword: "mezzo-soprano musical theatre" },
      { slug: "belt-vocalist-musical-theatre", keyword: "belt vocalist musical theatre" },
    ];
    const hit = findNearDuplicate("young mezzo soprano musical theatre", existing, 0.5);
    assert.ok(hit);
    assert.equal(hit.slug, "mezzo-soprano-musical-theatre");
    assert.equal(findNearDuplicate("latina musical theatre actress", existing, 0.72), null);
  });

  it("scores fit from performer tags", () => {
    const tags = performerFitTags({
      performer: {
        ethnicity: "White; olive skin presents as Middle Eastern, Hispanic, Latina, Mediterranean",
        vocalType: "Mezzo-Soprano with an extended range",
        vocalRange: "D3-G6 (Belt: G5)",
        playingAge: "15–28",
      },
    });
    assert.ok(tags.has("ethnicity:latina"));
    assert.ok(tags.has("vocal:mezzo"));
    assert.ok(tags.has("vocal:belt"));
    const good = fitScore(
      { fitTags: ["ethnicity:latina", "type:musical-theatre"] },
      tags,
    );
    assert.equal(good.score, 1);
    const bad = fitScore({ fitTags: ["vocal:bass", "vocal:baritone"] }, tags);
    assert.equal(bad.score, 0);
  });

  it("rejects ephemeral and show-title news", () => {
    assert.equal(isEvergreenCandidate({ evergreen: true, keyword: "mezzo" }), true);
    assert.equal(
      isEvergreenCandidate({ evergreen: true, keyword: "x" }, "Now casting this week"),
      false,
    );
    const allowlist = {
      rejectTitlePatterns: ["(?i)\\bwicked\\b", "(?i)\\bjoins\\s+the\\s+cast\\b"],
    };
    assert.equal(isRejectedNewsTitle("Actor joins the cast of Foo", allowlist), true);
    assert.equal(isRejectedNewsTitle("Latina musical theatre actress profile", allowlist), false);
  });

  it("parses RSS and maps titles to intents", () => {
    const xml = readFileSync(join(ROOT, "scripts/fixtures/casting-news-sample.xml"), "utf8");
    const items = parseRssItemTitles(xml);
    assert.ok(items.length >= 4);
    const intents = [
      {
        id: "latina-musical-theatre-actress",
        keyword: "Latina musical theatre actress",
        evergreen: true,
      },
      { id: "bass-baritone-musical-theatre", keyword: "bass baritone musical theatre", evergreen: true },
    ];
    const allowlist = {
      rejectTitlePatterns: ["(?i)\\bwicked\\b", "(?i)\\bhamilton\\b", "(?i)\\bjoins\\s+the\\s+cast\\b"],
    };
    const hits = mapNewsTitleToIntents(items[0].title, intents, allowlist);
    assert.ok(hits.some((h) => h.intentId === "latina-musical-theatre-actress"));
    assert.equal(mapNewsTitleToIntents("Actor joins the cast of Wicked", intents, allowlist).length, 0);
  });
});

describe("casting-language-discover fixture run", () => {
  it("writes winners artifact without Gemini or network", () => {
    const outDir = join(ROOT, "tmp-casting-language-test");
    const stubs = join(ROOT, "tmp-casting-language-stubs");
    rmSync(outDir, { recursive: true, force: true });
    rmSync(stubs, { recursive: true, force: true });
    const r = spawnSync(
      process.execPath,
      [
        "scripts/casting-language-discover.mjs",
        `--out-dir=${outDir}`,
        "--news-fixture=scripts/fixtures/casting-news-sample.xml",
        "--volume=scripts/fixtures/casting-volume-sample.json",
        `--write-stubs=${stubs}`,
        "--max-winners=5",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /DISC-P4-007/);
    assert.match(r.stdout, /winners=/);
    assert.doesNotMatch(r.stdout, /Gemini/);
    assert.ok(existsSync(join(outDir, "latest.json")));
    const artifact = JSON.parse(readFileSync(join(outDir, "latest.json"), "utf8"));
    assert.equal(artifact.actionId, "DISC-P4-007");
    assert.ok(artifact.winners.length >= 1);
    assert.ok(artifact.winners.every((w) => w.fitScore >= 0.5));
    assert.ok(artifact.winners.every((w) => (w.relatedShows || []).length > 0));
    assert.ok(artifact.skipped.some((s) => s.reason === "low_fit" || s.id.includes("bass")));
    assert.ok(artifact.notes.some((n) => /GSC/i.test(n)));
    const stubFiles = artifact.winners.map((w) => join(stubs, `${w.slug}.md`));
    for (const p of stubFiles) assert.ok(existsSync(p), p);
    rmSync(outDir, { recursive: true, force: true });
    rmSync(stubs, { recursive: true, force: true });
  });
});
