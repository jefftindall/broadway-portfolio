#!/usr/bin/env bash
# Load Studio post-deploy auth secrets without printing values.
# Shared vault: MONITOR-UPN, MONITOR-PASSWORD, MONITOR-TOTP-SEED
# Env vault:    AAD-CLIENT-SECRET
# Optional:     AAD_CLIENT_ID / AAD_MONITOR_TOKEN_SCOPE (GitHub env vars, or looked up)
#
# Sets MONITOR_AUTH_READY=1 when UPN, password, and TOTP seed are all populated.
# Playwright skips the login journey when MONITOR_AUTH_READY is not 1.
set -euo pipefail
set +x

shared_vault="${AZURE_SHARED_KEY_VAULT_NAME:-kv-elyse-shared}"
env_vault="${AZURE_KEY_VAULT_NAME:-}"
swa_name="${AZURE_STATIC_WEB_APP_NAME:-}"
swa_rg="${AZURE_RESOURCE_GROUP:-}"

if [[ -z "$env_vault" ]]; then
  echo "::error::AZURE_KEY_VAULT_NAME is not set (GitHub environment variable from Terraform)."
  exit 1
fi

mask_line() {
  local line="$1"
  if [[ -n "$line" && "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "::add-mask::${line}"
  fi
}

mask_value() {
  local value="$1"
  mask_line "$value"
  while IFS= read -r line || [[ -n "${line:-}" ]]; do
    mask_line "$line"
  done <<<"$value"
}

kv_value() {
  local vault="$1"
  local name="$2"
  local value=""
  value="$(az keyvault secret show --vault-name "$vault" --name "$name" --query value -o tsv 2>/dev/null || true)"
  printf '%s' "$value" | tr -d '\r'
}

echo "Loading Studio auth secrets from ${shared_vault} and ${env_vault} (names only)."

aad_secret="$(kv_value "$env_vault" AAD-CLIENT-SECRET)"
if [[ -z "$aad_secret" || "$aad_secret" == "REPLACE_ME" ]]; then
  echo "::error::AAD-CLIENT-SECRET missing in ${env_vault}."
  exit 1
fi
mask_value "$aad_secret"
echo "AAD_CLIENT_SECRET=${aad_secret}" >>"$GITHUB_ENV"
echo "Loaded AAD-CLIENT-SECRET (value masked)."

if [[ -z "${AAD_CLIENT_ID:-}" && -n "$swa_name" && -n "$swa_rg" ]]; then
  AAD_CLIENT_ID="$(az staticwebapp appsettings list --name "$swa_name" --resource-group "$swa_rg" --query "[?name=='AAD_CLIENT_ID'].value | [0]" -o tsv 2>/dev/null || true)"
  AAD_CLIENT_ID="$(printf '%s' "$AAD_CLIENT_ID" | tr -d '\r')"
fi
if [[ -n "${AAD_CLIENT_ID:-}" ]]; then
  echo "AAD_CLIENT_ID=${AAD_CLIENT_ID}" >>"$GITHUB_ENV"
  echo "AAD_CLIENT_ID is set."
else
  echo "AAD_CLIENT_ID is empty — token check will fail until SWA app settings or GitHub var exist."
fi

if [[ -z "${AAD_MONITOR_TOKEN_SCOPE:-}" && -n "${AAD_CLIENT_ID:-}" ]]; then
  AAD_MONITOR_TOKEN_SCOPE="api://${AAD_CLIENT_ID}/.default"
fi
if [[ -n "${AAD_MONITOR_TOKEN_SCOPE:-}" ]]; then
  echo "AAD_MONITOR_TOKEN_SCOPE=${AAD_MONITOR_TOKEN_SCOPE}" >>"$GITHUB_ENV"
fi

upn="$(kv_value "$shared_vault" MONITOR-UPN)"
password="$(kv_value "$shared_vault" MONITOR-PASSWORD)"
totp="$(kv_value "$shared_vault" MONITOR-TOTP-SEED)"

if [[ -z "$upn" || "$upn" == "REPLACE_ME" || -z "$password" || "$password" == "REPLACE_ME" ]]; then
  echo "MONITOR_AUTH_READY=0" >>"$GITHUB_ENV"
  echo "Monitor user secrets are not in ${shared_vault} yet — apply infra/bootstrap (monitor_user.tf). Playwright Studio login will skip."
  exit 0
fi

mask_value "$upn"
mask_value "$password"
echo "MONITOR_UPN=${upn}" >>"$GITHUB_ENV"
echo "MONITOR_PASSWORD=${password}" >>"$GITHUB_ENV"
echo "Loaded MONITOR-UPN and MONITOR-PASSWORD (values masked)."

if [[ -z "$totp" || "$totp" == "REPLACE_ME" ]]; then
  echo "MONITOR_AUTH_READY=0" >>"$GITHUB_ENV"
  echo "MONITOR-TOTP-SEED is REPLACE_ME — Playwright Studio login will skip. See docs/runbooks/studio-auth-monitoring.md."
  exit 0
fi

mask_value "$totp"
echo "MONITOR_TOTP_SEED=${totp}" >>"$GITHUB_ENV"
echo "MONITOR_AUTH_READY=1" >>"$GITHUB_ENV"
echo "MONITOR-TOTP-SEED is set (value masked). Playwright Studio login will run."
