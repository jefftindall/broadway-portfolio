#!/usr/bin/env bash
# Fetch ACS + digest recipient secrets from kv-elyse-shared into GITHUB_ENV.
# Never prints secret values. Emits ::add-mask:: only on GitHub Actions.
#
# Required: az login; Key Vault Secrets User on the vault.
# Env: AZURE_SHARED_KEY_VAULT_NAME (preferred) or AZURE_KEY_VAULT_NAME.
set -euo pipefail
set +x

vault="${AZURE_SHARED_KEY_VAULT_NAME:-${AZURE_KEY_VAULT_NAME:-}}"
if [[ -z "$vault" ]]; then
  echo "::error::AZURE_SHARED_KEY_VAULT_NAME is not set (bootstrap GitHub variable)."
  exit 1
fi

mask_line() {
  local line="$1"
  if [[ -n "$line" && "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "::add-mask::${line}"
  fi
}

fetch_optional() {
  local name="$1"
  local env_name="$2"
  local value
  value="$(az keyvault secret show --vault-name "$vault" --name "$name" --query value -o tsv 2>/dev/null || true)"
  value="$(printf '%s' "$value" | tr -d '\r')"
  if [[ -z "$value" || "$value" == "REPLACE_ME" ]]; then
    echo "${env_name}=" >>"$GITHUB_ENV"
    echo "Secret ${name} missing or REPLACE_ME — ${env_name} left empty."
    return 0
  fi
  # Mask full value + each line (ACS connection strings are single-line; PEMs are not used here).
  mask_line "$value"
  while IFS= read -r line || [[ -n "${line:-}" ]]; do
    mask_line "$line"
  done <<<"$value"
  echo "${env_name}=${value}" >>"$GITHUB_ENV"
}

fetch_required() {
  local name="$1"
  local env_name="$2"
  local value
  value="$(az keyvault secret show --vault-name "$vault" --name "$name" --query value -o tsv)"
  value="$(printf '%s' "$value" | tr -d '\r')"
  if [[ -z "$value" || "$value" == "REPLACE_ME" ]]; then
    echo "::error::Key Vault secret ${name} in ${vault} is missing or still REPLACE_ME."
    exit 1
  fi
  mask_line "$value"
  while IFS= read -r line || [[ -n "${line:-}" ]]; do
    mask_line "$line"
  done <<<"$value"
  echo "${env_name}=${value}" >>"$GITHUB_ENV"
}

# ACS is required to send; recipients may be empty (script skips).
fetch_required ACS-CONNECTION-STRING ACS_CONNECTION_STRING
fetch_required ACS-EMAIL-SENDER ACS_EMAIL_SENDER
fetch_optional ALERT-EMAIL ALERT_EMAIL
fetch_optional SITE-CONTACT-EMAIL SITE_CONTACT_EMAIL

echo "Loaded ACS digest secrets from shared vault ${vault} (recipient addresses not logged)."
