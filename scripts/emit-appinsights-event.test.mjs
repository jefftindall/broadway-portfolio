import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "emit-appinsights-event.sh");
const FAKE_IKEY = "11111111-2222-3333-4444-555555555555";
const FAKE_CS =
  `InstrumentationKey=${FAKE_IKEY};IngestionEndpoint=https://ingest.test.example;LiveEndpoint=https://live.test.example`;

function writeExec(file, body) {
  fs.writeFileSync(file, body, { mode: 0o755 });
}

function runEmit(binDir, extraEnv = {}, args = ["DeployStarted"]) {
  return spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      PATH: `${binDir}:${process.env.PATH}`,
      HOME: process.env.HOME,
      ...extraEnv,
    },
  });
}

function makeBins() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "emit-ai-event-"));
  writeExec(
    path.join(dir, "curl"),
    `#!/usr/bin/env bash
set -euo pipefail
echo "curl \$*" >> "${dir}/curl.args"
payload=""
out="/dev/null"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --data-binary)
      payload="\${2#@}"
      shift 2
      ;;
    -o)
      out="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
if [[ -n "\$payload" ]]; then
  cp "\$payload" "${dir}/payload.json"
fi
: > "\$out"
`,
  );
  return dir;
}

function combined(result) {
  return `${result.stdout}\n${result.stderr}`;
}

test("skips when APPINSIGHTS_CONNECTION_STRING is empty", () => {
  const dir = makeBins();
  const result = runEmit(dir, { APPINSIGHTS_CONNECTION_STRING: "" });
  assert.equal(result.status, 0, combined(result));
  assert.match(result.stdout, /skipping DeployStarted/);
  assert.equal(fs.existsSync(path.join(dir, "curl.args")), false);
});

test("rejects an invalid event name", () => {
  const dir = makeBins();
  const result = runEmit(dir, { APPINSIGHTS_CONNECTION_STRING: FAKE_CS }, [
    "not a name",
  ]);
  assert.equal(result.status, 2);
  assert.match(combined(result), /Usage/);
  assert.equal(fs.existsSync(path.join(dir, "curl.args")), false);
});

test("posts a payload without printing the instrumentation key", () => {
  const dir = makeBins();
  const result = runEmit(dir, {
    APPINSIGHTS_CONNECTION_STRING: FAKE_CS,
    DEPLOY_ENVIRONMENT: "prod",
    GIT_SHA: "abc123",
    JOB_NAME: "Deploy Production",
    RUN_URL: "https://example.test/run/1",
  });
  assert.equal(result.status, 0, combined(result));
  assert.match(result.stdout, /Emitted DeployStarted/);
  const text = combined(result);
  assert.doesNotMatch(text, new RegExp(FAKE_IKEY));
  assert.doesNotMatch(text, /InstrumentationKey=/);
  assert.doesNotMatch(text, /ingest\.test\.example/);

  const args = fs.readFileSync(path.join(dir, "curl.args"), "utf8");
  assert.match(args, /https:\/\/ingest\.test\.example\/v2\/track/);

  const payload = JSON.parse(fs.readFileSync(path.join(dir, "payload.json"), "utf8"));
  assert.equal(payload[0].data.baseData.name, "DeployStarted");
  assert.equal(payload[0].data.baseData.properties.environment, "prod");
  assert.equal(payload[0].data.baseData.properties.sha, "abc123");
  assert.equal(payload[0].data.baseData.properties.job, "Deploy Production");
  assert.equal(payload[0].data.baseData.properties.runUrl, "https://example.test/run/1");
  assert.equal(payload[0].iKey, FAKE_IKEY);
});

test("masks the instrumentation key line-by-line under GitHub Actions", () => {
  const dir = makeBins();
  const result = runEmit(dir, {
    APPINSIGHTS_CONNECTION_STRING: FAKE_CS,
    GITHUB_ACTIONS: "true",
  });
  assert.equal(result.status, 0, combined(result));
  assert.match(result.stdout, new RegExp(`::add-mask::${FAKE_IKEY}`));
});

test("CD workflows call the emit script and do not parse the connection string inline", () => {
  const files = [
    ".github/workflows/azure-static-web-apps.yml",
    ".github/workflows/staging-branch.yml",
  ].map((rel) => fs.readFileSync(path.join(ROOT, rel), "utf8"));
  for (const text of files) {
    assert.match(text, /scripts\/emit-appinsights-event\.sh/);
    assert.doesNotMatch(text, /IKEY=\$\(echo/);
    assert.doesNotMatch(text, /InstrumentationKey=/);
  }
});
