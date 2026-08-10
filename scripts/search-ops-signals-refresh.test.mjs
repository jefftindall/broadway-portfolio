/**
 * Unit tests for SEARCH-P4-002 theme helpers + fixture refresh (no live APIs).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  classifyQuery,
  ctrBand,
  impressionBand,
  isStudioPath,
  pathFromGscPage,
} from "./lib/search-signal-themes.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

describe("search-signal-themes", () => {
  it("flags brand queries", () => {
    const c = classifyQuery("elyse tindall actress");
    assert.equal(c.brand, true);
    assert.ok(c.themes.includes("actress") || c.themes.includes("brand"));
  });

  it("themes lessons and casting", () => {
    assert.ok(classifyQuery("voice lessons nyc").themes.includes("lessons"));
    assert.ok(classifyQuery("nyc casting musical").themes.includes("casting"));
  });

  it("bands impressions and CTR", () => {
    assert.equal(impressionBand(0), "none");
    assert.equal(impressionBand(25), "10-49");
    assert.equal(ctrBand(0.015), "1-2pct");
    assert.equal(ctrBand(0.12), "10pct+");
  });

  it("normalizes GSC page URLs", () => {
    assert.equal(pathFromGscPage("https://elysetindall.com/for/foo/"), "/for/foo");
    assert.equal(isStudioPath("/studio/help"), true);
    assert.equal(isStudioPath("/shows"), false);
  });
});

describe("search-ops-signals-refresh fixture", () => {
  it("writes dated + latest artifacts from fixture without dumping query tables", () => {
    const outDir = join(ROOT, "tmp-search-signals-test");
    rmSync(outDir, { recursive: true, force: true });
    const r = spawnSync(
      process.execPath,
      [
        "scripts/search-ops-signals-refresh.mjs",
        "--fixture=scripts/fixtures/search-signals-sample.json",
        `--out-dir=${outDir}`,
        "--from=2026-07-27",
        "--to=2026-08-09",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /SEARCH-P4-002/);
    assert.match(r.stdout, /themes=/);
    assert.match(r.stdout, /explicit/);
    assert.doesNotMatch(r.stdout, /voice lessons nyc/);
    const jsonPath = join(outDir, "2026-07-27_2026-08-09.json");
    const mdPath = join(outDir, "2026-07-27_2026-08-09.md");
    assert.ok(existsSync(jsonPath));
    assert.ok(existsSync(mdPath));
    assert.ok(existsSync(join(outDir, "latest.json")));
    const artifact = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.equal(artifact.actionId, "SEARCH-P4-002");
    assert.equal(artifact.period, "2026-07-27_2026-08-09");
    assert.equal(artifact.window.from, "2026-07-27");
    assert.equal(artifact.window.toInclusive, "2026-08-09");
    assert.equal(artifact.window.source, "explicit");
    assert.equal(artifact.gsc.ok, true);
    assert.equal(artifact.ga.ok, true);
    assert.equal(artifact.coverage.length, 5);
    assert.ok(artifact.coverage.every((c) => c.status === "ok"));
    assert.ok((artifact.castingLandersInRepo || []).length > 0);
    rmSync(outDir, { recursive: true, force: true });
  });

  it("starts the day after the previous latest window end", () => {
    const outDir = join(ROOT, "tmp-search-signals-since");
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, "latest.json"),
      `${JSON.stringify({
        window: { from: "2026-07-01", toInclusive: "2026-07-14" },
        generatedAt: "2026-07-15T15:00:00.000Z",
      })}\n`,
      "utf8",
    );
    const r = spawnSync(
      process.execPath,
      [
        "scripts/search-ops-signals-refresh.mjs",
        "--fixture=scripts/fixtures/search-signals-sample.json",
        `--out-dir=${outDir}`,
        "--to=2026-07-28",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /since_last_run/);
    const artifact = JSON.parse(readFileSync(join(outDir, "latest.json"), "utf8"));
    assert.equal(artifact.window.from, "2026-07-15");
    assert.equal(artifact.window.toInclusive, "2026-07-28");
    assert.equal(artifact.window.source, "since_last_run");
    assert.ok(existsSync(join(outDir, "2026-07-15_2026-07-28.json")));
    rmSync(outDir, { recursive: true, force: true });
  });
});
