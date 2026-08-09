#!/usr/bin/env bash
# Fetch GA Data API secrets from kv-elyse-shared for monthly scorecard visits/top pages.
# Never prints secret values. Masks line-by-line only when GITHUB_ACTIONS=true.
# Soft-fail: if secrets are missing/REPLACE_ME, leaves env empty so the refresh
# script marks GA rows stale without failing the job.
#
# Required: az login; Key Vault Secrets User on the vault.
# Env: AZURE_SHARED_KEY_VAULT_NAME (preferred) or AZURE_KEY_VAULT_NAME.
#
# Outputs (GITHUB_ENV when set, else exported for local use via eval):
#   GA_PROPERTY_ID
#   GA_DATA_API_SA_JSON_FILE  (0600 temp file; caller should delete after use)
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

emit_env() {
  local name="$1"
  local value="$2"
  if [[ -n "${GITHUB_ENV:-}" ]]; then
    echo "${name}=${value}" >>"$GITHUB_ENV"
  else
    export "${name}=${value}"
  fi
}

# Property ID (numeric) — single-line; never log the value.
prop=""
prop="$(az keyvault secret show --vault-name "$vault" --name GA-PROPERTY-ID --query value -o tsv 2>/dev/null || true)"
prop="$(printf '%s' "$prop" | tr -d '\r')"
if [[ -z "$prop" || "$prop" == "REPLACE_ME" ]]; then
  emit_env GA_PROPERTY_ID ""
  echo "GA-PROPERTY-ID missing or REPLACE_ME — visits/top pages will be stale."
else
  mask_line "$prop"
  emit_env GA_PROPERTY_ID "$prop"
  echo "Loaded GA-PROPERTY-ID from shared vault ${vault} (value not logged)."
fi

# Service-account JSON — write to 0600 temp file; mask each line in Actions.
sa_raw=""
sa_raw="$(az keyvault secret show --vault-name "$vault" --name GA-DATA-API-SA-JSON --query value -o tsv 2>/dev/null || true)"
sa_raw="$(printf '%s' "$sa_raw" | tr -d '\r')"
if [[ -z "$sa_raw" || "$sa_raw" == "REPLACE_ME" ]]; then
  emit_env GA_DATA_API_SA_JSON_FILE ""
  echo "GA-DATA-API-SA-JSON missing or REPLACE_ME — visits/top pages will be stale."
  exit 0
fi

tmp="$(mktemp "${TMPDIR:-/tmp}/ga-scorecard-sa.XXXXXX.json")"
chmod 600 "$tmp"
# Write without echoing; mask line-by-line before any accidental log of the file.
printf '%s' "$sa_raw" >"$tmp"
while IFS= read -r line || [[ -n "${line:-}" ]]; do
  mask_line "$line"
done <"$tmp"
# Also mask the common compact single-line form if the file was one line.
mask_line "$sa_raw"

emit_env GA_DATA_API_SA_JSON_FILE "$tmp"
echo "Loaded GA-DATA-API-SA-JSON into a temp file for the scorecard job (path not containing the secret body)."
