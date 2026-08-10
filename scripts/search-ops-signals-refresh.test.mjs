/**
 * Unit tests for SEARCH-P4-002 theme helpers + fixture refresh (no live APIs).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
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
  it("writes json+md from fixture without dumping query tables to stdout", () => {
    const outDir = join(ROOT, "tmp-search-signals-test");
    rmSync(outDir, { recursive: true, force: true });
    const r = spawnSync(
      process.execPath,
      [
        "scripts/search-ops-signals-refresh.mjs",
        "--fixture=scripts/fixtures/search-signals-sample.json",
        `--out-dir=${outDir}`,
        "--anchor=2026-08-10",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /SEARCH-P4-002/);
    assert.match(r.stdout, /themes=/);
    assert.doesNotMatch(r.stdout, /voice lessons nyc/);
    const jsonPath = join(outDir, "2026-07.json");
    const mdPath = join(outDir, "2026-07.md");
    assert.ok(existsSync(jsonPath));
    assert.ok(existsSync(mdPath));
    const artifact = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.equal(artifact.actionId, "SEARCH-P4-002");
    assert.equal(artifact.month, "2026-07");
    assert.equal(artifact.gsc.ok, true);
    assert.equal(artifact.ga.ok, true);
    assert.equal(artifact.coverage.length, 5);
    assert.ok(artifact.coverage.every((c) => c.status === "ok"));
    assert.ok((artifact.castingLandersInRepo || []).length > 0);
    rmSync(outDir, { recursive: true, force: true });
  });
});
