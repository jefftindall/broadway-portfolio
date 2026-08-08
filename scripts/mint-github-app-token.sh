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
  if [[ -n "$line" ]]; then
    echo "::add-mask::${line}"
  fi
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
cleanup() { rm -f "$KEY_FILE"; }
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
# openssl stderr suppressed — never risk dumping key material on error paths.
signature="$(
  printf '%s' "${header}.${payload}" \
    | openssl dgst -sha256 -sign "$KEY_FILE" -binary 2>/dev/null \
    | b64url
)"
jwt="${header}.${payload}.${signature}"
mask_line "$jwt"

# Drop the PEM as soon as the JWT exists.
rm -f "$KEY_FILE"
trap - EXIT

token_json="$(
  curl -sS -X POST \
    -H "Authorization: Bearer ${jwt}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -H "Content-Type: application/json" \
    -d '{"permissions":{"contents":"write","metadata":"read","actions":"read"}}' \
    "https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens"
)"
TOKEN="$(printf '%s' "$token_json" | jq -r '.token // empty')"
CONTENTS_PERM="$(printf '%s' "$token_json" | jq -r '.permissions.contents // empty')"

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "::error::Failed to mint GitHub App installation token (check App ID, installation ID, and private key)."
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

echo "Minted GitHub App installation token (app=${APP_ID}, installation=${INSTALLATION_ID}, contents=${CONTENTS_PERM})."
