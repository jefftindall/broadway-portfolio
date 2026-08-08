#!/usr/bin/env bash
# Mint a GitHub App installation access token from Key Vault.
#
# Required env:
#   AZURE_KEY_VAULT_NAME (or VAULT) — vault holding GITHUB-APP-*
#
# Writes to GITHUB_OUTPUT (when set):
#   token, app_id, installation_id, contents_permission
#
# Safety:
# - Never echo the PEM (or any multiline secret) in one command — that dumps
#   trailing lines to the Actions log unmasked.
# - Mask each PEM line with ::add-mask:: before any further work.
# - Disable shell xtrace for the whole script.
# - Write the PEM only to a 0600 temp file, then delete it.
# - On API failure, log HTTP status + error message only (never token/PEM).
set -euo pipefail
set +x
export PS4="+ "

VAULT="${VAULT:-${AZURE_KEY_VAULT_NAME:-}}"
if [[ -z "$VAULT" ]]; then
  echo "::error::AZURE_KEY_VAULT_NAME (or VAULT) is not set."
  exit 1
fi

mask_line() {
  local line="$1"
  # ::add-mask:: is honored only on GitHub Actions runners. Echoing it locally
  # prints the secret to the terminal in cleartext — never do that.
  if [[ -n "$line" && "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "::add-mask::${line}"
  fi
}

# Prefer jq; fall back to node (available on this repo's Windows/dev machines).
json_get() {
  local json="$1"
  local expr="$2" # jq expression, e.g. '.token // empty'
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$json" | jq -r "$expr"
    return
  fi
  printf '%s' "$json" | node --input-type=module -e '
import fs from "node:fs";
const j = JSON.parse(fs.readFileSync(0, "utf8"));
const expr = process.argv[1];
const path = expr.replace(/^\./, "").replace(/\s*\/\/\s*empty$/, "").trim();
let cur = j;
for (const part of path.split(".").filter(Boolean)) {
  cur = cur?.[part];
}
process.stdout.write(cur == null || cur === "" ? "" : String(cur));
' "$expr"
}

# CRITICAL: never `echo "::add-mask::$multiline"` — only the first line is
# treated as a workflow command; remaining lines print to the job log in cleartext.
mask_file_lines() {
  local file="$1"
  while IFS= read -r line || [[ -n "${line:-}" ]]; do
    mask_line "$line"
  done <"$file"
}

APP_ID="$(az keyvault secret show --vault-name "$VAULT" --name GITHUB-APP-ID --query value -o tsv)"
INSTALLATION_ID="$(az keyvault secret show --vault-name "$VAULT" --name GITHUB-APP-INSTALLATION-ID --query value -o tsv)"

if [[ -z "$APP_ID" || "$APP_ID" == "REPLACE_ME" ]]; then
  echo "::error::GITHUB-APP-ID missing or still REPLACE_ME in ${VAULT}."
  exit 1
fi
if [[ -z "$INSTALLATION_ID" || "$INSTALLATION_ID" == "REPLACE_ME" ]]; then
  echo "::error::GITHUB-APP-INSTALLATION-ID missing or still REPLACE_ME in ${VAULT}."
  exit 1
fi

KEY_FILE="$(mktemp)"
chmod 600 "$KEY_FILE"
OPENSSL_ERR="$(mktemp)"
cleanup() { rm -f "$KEY_FILE" "$OPENSSL_ERR"; }
trap cleanup EXIT

# Fetch PEM straight to file (normalize literal \n). Do not store in a shell var
# that might be expanded into an echo/log path.
az keyvault secret show --vault-name "$VAULT" --name GITHUB-APP-PRIVATE-KEY --query value -o tsv \
  | sed 's/\\n/\n/g' >"$KEY_FILE"

if ! grep -q -E 'BEGIN ([A-Z]+ )?PRIVATE KEY' "$KEY_FILE"; then
  if grep -q 'REPLACE_ME' "$KEY_FILE"; then
    echo "::error::GITHUB-APP-PRIVATE-KEY is still REPLACE_ME in ${VAULT}."
  else
    echo "::error::GITHUB-APP-PRIVATE-KEY in ${VAULT} is missing or not a PEM."
  fi
  exit 1
fi

mask_file_lines "$KEY_FILE"

now="$(date +%s)"
iat=$((now - 60))
exp=$((now + 540))
b64url() { openssl base64 -e -A | tr '+/' '-_' | tr -d '='; }
header="$(printf '%s' '{"alg":"RS256","typ":"JWT"}' | b64url)"
payload="$(printf '%s' "{\"iat\":${iat},\"exp\":${exp},\"iss\":\"${APP_ID}\"}" | b64url)"
# Capture openssl errors without printing key material (stderr is algorithm/path only).
signature="$(
  printf '%s' "${header}.${payload}" \
    | openssl dgst -sha256 -sign "$KEY_FILE" -binary 2>"$OPENSSL_ERR" \
    | b64url
)"
if [[ -z "$signature" ]]; then
  echo "::error::openssl failed to sign GitHub App JWT (is GITHUB-APP-PRIVATE-KEY a valid PEM?)."
  # openssl errors are safe (no key bytes); keep to one line.
  if [[ -s "$OPENSSL_ERR" ]]; then
    echo "::error::openssl: $(tr '\n' ' ' <"$OPENSSL_ERR" | sed 's/[[:space:]]\+/ /g')"
  fi
  exit 1
fi
jwt="${header}.${payload}.${signature}"
mask_line "$jwt"

# Drop the PEM as soon as the JWT exists.
rm -f "$KEY_FILE"
trap 'rm -f "$OPENSSL_ERR"' EXIT

# Do not subset permissions in the POST body — requesting a permission the App
# installation does not have returns 422 and yields no token. Default = all
# permissions granted to the App (Contents:write, Metadata:read, Actions:read).
http_file="$(mktemp)"
trap 'rm -f "$OPENSSL_ERR" "$http_file"' EXIT
http_code="$(
  curl -sS -o "$http_file" -w '%{http_code}' -X POST \
    -H "Authorization: Bearer ${jwt}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens"
)"

token_json="$(cat "$http_file")"
rm -f "$http_file"
TOKEN="$(json_get "$token_json" '.token // empty')"
CONTENTS_PERM="$(json_get "$token_json" '.permissions.contents // empty')"

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  err_msg="$(json_get "$token_json" '.message // empty')"
  err_doc="$(json_get "$token_json" '.documentation_url // empty')"
  echo "::error::Failed to mint GitHub App installation token (HTTP ${http_code})."
  if [[ -n "$err_msg" ]]; then
    echo "::error::GitHub API: ${err_msg}"
  fi
  if [[ -n "$err_doc" ]]; then
    echo "::error::Docs: ${err_doc}"
  fi
  echo "::error::Check App ID ${APP_ID}, installation ${INSTALLATION_ID}, and that GITHUB-APP-PRIVATE-KEY matches the current App private key in ${VAULT}."
  exit 1
fi
mask_line "$TOKEN"

if [[ "$CONTENTS_PERM" != "write" ]]; then
  echo "::error::Installation token contents permission is '${CONTENTS_PERM:-missing}', expected write."
  exit 1
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "token=${TOKEN}"
    echo "app_id=${APP_ID}"
    echo "installation_id=${INSTALLATION_ID}"
    echo "contents_permission=${CONTENTS_PERM}"
  } >>"$GITHUB_OUTPUT"
fi

# Export for local test harness (never printed).
if [[ -n "${GITHUB_APP_TOKEN_FILE:-}" ]]; then
  umask 077
  printf '%s' "$TOKEN" >"$GITHUB_APP_TOKEN_FILE"
fi

echo "Minted GitHub App installation token (app=${APP_ID}, installation=${INSTALLATION_ID}, contents=${CONTENTS_PERM}, http=${http_code})."
