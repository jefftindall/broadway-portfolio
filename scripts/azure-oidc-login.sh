#!/usr/bin/env bash
# Log in to Azure with a GitHub Actions OIDC federated token.
#
# Required env:
#   AZURE_LOGIN_CLIENT_ID / AZURE_LOGIN_TENANT_ID / AZURE_LOGIN_SUBSCRIPTION_ID
#   (fallbacks: AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_SUBSCRIPTION_ID)
#   ACTIONS_ID_TOKEN_REQUEST_URL
#   ACTIONS_ID_TOKEN_REQUEST_TOKEN
#
# Optional:
#   AZURE_LOGIN_ATTEMPTS          default 3
#   AZURE_LOGIN_RETRY_SLEEP       seconds between attempts (default 10)
#   AZURE_LOGIN_AUDIENCE          default api://AzureADTokenExchange
#
# Safety:
# - Never echo the OIDC JWT or federated token.
# - Disable shell xtrace for the whole script.
# - Write tokens only to 0600 temp files, then delete them.
# - On GitHub Actions, mask the JWT line-by-line from the file before az login.
# - On failure, log attempt counts and error kinds only — never token values.
set -euo pipefail
set +x
export PS4="+ "

CLIENT_ID="${AZURE_LOGIN_CLIENT_ID:-${AZURE_CLIENT_ID:-}}"
TENANT_ID="${AZURE_LOGIN_TENANT_ID:-${AZURE_TENANT_ID:-}}"
SUBSCRIPTION_ID="${AZURE_LOGIN_SUBSCRIPTION_ID:-${AZURE_SUBSCRIPTION_ID:-}}"
ATTEMPTS="${AZURE_LOGIN_ATTEMPTS:-3}"
RETRY_SLEEP="${AZURE_LOGIN_RETRY_SLEEP:-10}"
AUDIENCE="${AZURE_LOGIN_AUDIENCE:-api://AzureADTokenExchange}"

if [[ -z "$CLIENT_ID" || -z "$TENANT_ID" || -z "$SUBSCRIPTION_ID" ]]; then
  echo "::error::Azure OIDC login needs AZURE_LOGIN_CLIENT_ID, AZURE_LOGIN_TENANT_ID, and AZURE_LOGIN_SUBSCRIPTION_ID."
  exit 1
fi
if [[ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" || -z "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" ]]; then
  echo "::error::GitHub OIDC token request env is missing (workflow needs permissions.id-token: write)."
  exit 1
fi
if ! [[ "$ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "::error::AZURE_LOGIN_ATTEMPTS must be a positive integer."
  exit 1
fi
if ! command -v az >/dev/null 2>&1; then
  echo "::error::Azure CLI (az) is not on PATH."
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "::error::curl is not on PATH."
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "::error::jq is not on PATH."
  exit 1
fi

mask_line() {
  local line="$1"
  if [[ -n "$line" && "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "::add-mask::${line}"
  fi
}

mask_file_lines() {
  local file="$1"
  while IFS= read -r line || [[ -n "${line:-}" ]]; do
    mask_line "$line"
  done <"$file"
}

# Print az stderr after removing any copy of the federated token.
print_az_error() {
  local err_file="$1"
  local token_file="$2"
  if [[ ! -s "$err_file" ]]; then
    echo "az login failed with empty stderr (kind: empty-cli-output)"
    return
  fi
  if [[ -s "$token_file" ]]; then
    # token is a single-line JWT; strip it if az ever echoed argv
    local redacted
    redacted="$(TOKEN_FILE="$token_file" python3 -c '
import os, pathlib
text = pathlib.Path(os.environ["AZ_ERR_FILE"]).read_text(errors="replace")
token = pathlib.Path(os.environ["TOKEN_FILE"]).read_text().strip()
if token:
    text = text.replace(token, "[redacted-oidc-token]")
print(text, end="")
' )" || redacted="az login failed (kind: json-or-cli-error; stderr redaction failed)"
    echo "$redacted"
    return
  fi
  echo "az login failed (kind: json-or-cli-error)"
}

oidc_url="$ACTIONS_ID_TOKEN_REQUEST_URL"
if [[ "$oidc_url" == *"?"* ]]; then
  oidc_url="${oidc_url}&audience=${AUDIENCE}"
else
  oidc_url="${oidc_url}?audience=${AUDIENCE}"
fi

WORKDIR="$(mktemp -d)"
chmod 700 "$WORKDIR"
cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

RESPONSE_FILE="$WORKDIR/oidc-response.json"
TOKEN_FILE="$WORKDIR/oidc.jwt"
AZ_ERR="$WORKDIR/az.err"
export AZ_ERR_FILE="$AZ_ERR"

fetch_oidc_token() {
  rm -f "$RESPONSE_FILE" "$TOKEN_FILE"
  : >"$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  local curl_status=0
  curl -sS -f \
    -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
    -H "Accept: application/json" \
    -o "$RESPONSE_FILE" \
    "$oidc_url" || curl_status=$?
  chmod 600 "$RESPONSE_FILE" 2>/dev/null || true
  if [[ "$curl_status" -ne 0 ]]; then
    echo "GitHub OIDC token request failed (kind: http-${curl_status})."
    return 1
  fi
  if [[ ! -s "$RESPONSE_FILE" ]]; then
    echo "GitHub OIDC token request returned an empty body (kind: empty-oidc-response)."
    return 1
  fi
  if ! jq -er '.value | select(type=="string" and length>0)' "$RESPONSE_FILE" >"$TOKEN_FILE"; then
    echo "GitHub OIDC token response had no string .value (kind: invalid-oidc-json)."
    return 1
  fi
  chmod 600 "$TOKEN_FILE"
  mask_file_lines "$TOKEN_FILE"
}

az cloud set -n azurecloud >/dev/null

attempt=1
while (( attempt <= ATTEMPTS )); do
  echo "Azure OIDC login attempt ${attempt}/${ATTEMPTS}…"
  if ! fetch_oidc_token; then
    echo "Azure OIDC login attempt ${attempt} failed while minting the GitHub federated token."
  else
    : >"$AZ_ERR"
    chmod 600 "$AZ_ERR"
    login_status=0
    # Read into a local so the JWT is not passed via a command substitution that
    # could land in xtrace. xtrace stays off for the whole script.
    IFS= read -r FEDERATED_TOKEN <"$TOKEN_FILE" || true
    if [[ -z "${FEDERATED_TOKEN:-}" ]]; then
      echo "Azure OIDC login attempt ${attempt} failed (kind: empty-federated-token)."
      login_status=1
    elif ! az login \
      --service-principal \
      --username "$CLIENT_ID" \
      --tenant "$TENANT_ID" \
      --federated-token "$FEDERATED_TOKEN" \
      --allow-no-subscriptions \
      --output none 2>"$AZ_ERR"; then
      login_status=1
      print_az_error "$AZ_ERR" "$TOKEN_FILE"
    elif ! az account set --subscription "$SUBSCRIPTION_ID" 2>"$AZ_ERR"; then
      login_status=1
      echo "az account set failed (kind: subscription-set)."
      print_az_error "$AZ_ERR" "$TOKEN_FILE"
    fi
    unset FEDERATED_TOKEN
    if [[ "$login_status" -eq 0 ]]; then
      echo "Azure OIDC login succeeded on attempt ${attempt}."
      exit 0
    fi
    echo "Azure OIDC login attempt ${attempt} failed."
    az account clear >/dev/null 2>&1 || true
  fi
  if (( attempt == ATTEMPTS )); then
    break
  fi
  if [[ "$RETRY_SLEEP" != "0" ]]; then
    echo "Retrying Azure OIDC login in ${RETRY_SLEEP}s…"
    sleep "$RETRY_SLEEP"
  fi
  attempt=$((attempt + 1))
done

echo "::error::Azure OIDC login failed after ${ATTEMPTS} attempt(s). Transient az JSON parse errors are retried; persistent AADSTS700213 is a federated-subject mismatch."
exit 1
