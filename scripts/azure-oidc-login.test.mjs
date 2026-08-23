import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "azure-oidc-login.sh");
const FAKE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.smoke-oidc-jwt";

function writeExec(file, body) {
  fs.writeFileSync(file, body, { mode: 0o755 });
}

function runLogin(binDir, extraEnv = {}) {
  return spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    env: {
      PATH: `${binDir}:${process.env.PATH}`,
      AZURE_LOGIN_CLIENT_ID: "00000000-0000-0000-0000-000000000001",
      AZURE_LOGIN_TENANT_ID: "00000000-0000-0000-0000-000000000002",
      AZURE_LOGIN_SUBSCRIPTION_ID: "00000000-0000-0000-0000-000000000003",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://oidc.test/token?api-version=2.0",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "github-oidc-request-token",
      AZURE_LOGIN_ATTEMPTS: "3",
      AZURE_LOGIN_RETRY_SLEEP: "0",
      ...extraEnv,
    },
  });
}

function makeBins(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "azure-oidc-login-"));
  const failUntil = options.failUntil ?? 0;
  const curlFailTimes = options.curlFailTimes ?? 0;

  writeExec(
    path.join(dir, "curl"),
    `#!/usr/bin/env bash
set -euo pipefail
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    *) shift ;;
  esac
done
count_file="${dir}/curl.count"
n=$(($(cat "$count_file" 2>/dev/null || echo 0) + 1))
echo "$n" > "$count_file"
fail_until="${curlFailTimes}"
if (( n <= fail_until )); then
  echo "curl: mock OIDC endpoint unavailable" >&2
  exit 22
fi
if [[ -z "\$out" ]]; then
  echo "mock curl missing -o" >&2
  exit 2
fi
printf '%s' '{"value":"${FAKE_JWT}"}' > "\$out"
`,
  );

  writeExec(
    path.join(dir, "az"),
    `#!/usr/bin/env bash
set -euo pipefail
cmd="\${1:-}"
echo "az \$*" >> "${dir}/az.log"
case "\$cmd" in
  cloud) exit 0 ;;
  account)
    exit 0
    ;;
  login)
    n=$((\$(cat "${dir}/az.login.count" 2>/dev/null || echo 0) + 1))
    echo "\$n" > "${dir}/az.login.count"
    if (( n <= ${failUntil} )); then
      echo "JSON is invalid: Expecting value: line 1 column 1 (char 0)" >&2
      exit 1
    fi
    exit 0
    ;;
  *) exit 0 ;;
esac
`,
  );

  return dir;
}

test("retries transient az JSON login errors then succeeds", () => {
  const binDir = makeBins({ failUntil: 2 });
  const result = runLogin(binDir);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /succeeded on attempt 3/);
  assert.match(result.stdout, /JSON is invalid/);
  assert.equal(result.stdout.includes(FAKE_JWT), false, "federated token must not appear in stdout");
  assert.equal(result.stderr.includes(FAKE_JWT), false, "federated token must not appear in stderr");
  const loginCount = Number(fs.readFileSync(path.join(binDir, "az.login.count"), "utf8"));
  const curlCount = Number(fs.readFileSync(path.join(binDir, "curl.count"), "utf8"));
  assert.equal(loginCount, 3);
  assert.equal(curlCount, 3);
});

test("fails after exhausting retries", () => {
  const binDir = makeBins({ failUntil: 5 });
  const result = runLogin(binDir);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /failed after 3 attempt/);
  assert.equal((result.stdout + result.stderr).includes(FAKE_JWT), false);
  const loginCount = Number(fs.readFileSync(path.join(binDir, "az.login.count"), "utf8"));
  assert.equal(loginCount, 3);
});

test("retries a failed GitHub OIDC mint then logs in", () => {
  const binDir = makeBins({ curlFailTimes: 1 });
  const result = runLogin(binDir);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /succeeded on attempt 2/);
  assert.match(result.stdout, /http-22/);
  const loginCount = Number(fs.readFileSync(path.join(binDir, "az.login.count"), "utf8"));
  assert.equal(loginCount, 1);
});

test("requires OIDC request env", () => {
  const binDir = makeBins();
  const result = runLogin(binDir, {
    ACTIONS_ID_TOKEN_REQUEST_URL: "",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "",
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /id-token: write/);
});
