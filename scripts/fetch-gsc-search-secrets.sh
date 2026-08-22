#!/usr/bin/env bash
# Fetch GSC Search Analytics API secrets from kv-elyse-shared (SEARCH-P4-001).
# Never prints secret values. Masks line-by-line only when GITHUB_ACTIONS=true.
#
# Defaults when vault values are missing / REPLACE_ME / unreachable:
#   GSC_SITE_URL → https://elysetindall.com/  (live URL-prefix property; not secret)
#   GSC SA JSON  → fall back to GA-DATA-API-SA-JSON (reuse scorecard SA)
#
# Required: az login; Key Vault Secrets User on the vault (for SA JSON).
# Env: AZURE_SHARED_KEY_VAULT_NAME (preferred) or AZURE_KEY_VAULT_NAME.
#
# Outputs (GITHUB_ENV when set, else exported for local use via eval/source):
#   GSC_SITE_URL
#   GSC_DATA_API_SA_JSON_FILE  (0600 temp file; caller should delete after use)
set -euo pipefail
set +x

# Live Search Console URL-prefix property (public). Used when KV is unset/REPLACE_ME.
DEFAULT_GSC_SITE_URL="https://elysetindall.com/"

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

# Site URL — single-line (sc-domain:… or https://…/). Default when missing/REPLACE_ME.
site=""
site="$(az keyvault secret show --vault-name "$vault" --name GSC-SITE-URL --query value -o tsv 2>/dev/null || true)"
site="$(printf '%s' "$site" | tr -d '\r')"
if [[ -z "$site" || "$site" == "REPLACE_ME" ]]; then
  emit_env GSC_SITE_URL "$DEFAULT_GSC_SITE_URL"
  echo "GSC-SITE-URL missing or REPLACE_ME — using default URL-prefix property (value not logged as sensitive)."
else
  # Not a secret, but avoid noisy logs of config churn.
  emit_env GSC_SITE_URL "$site"
  echo "Loaded GSC-SITE-URL from shared vault ${vault}."
fi

write_sa_file() {
  local sa_raw="$1"
  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/gsc-search-sa.XXXXXX.json")"
  chmod 600 "$tmp"
  printf '%s' "$sa_raw" >"$tmp"
  while IFS= read -r line || [[ -n "${line:-}" ]]; do
    mask_line "$line"
  done <"$tmp"
  mask_line "$sa_raw"
  emit_env GSC_DATA_API_SA_JSON_FILE "$tmp"
}

# Prefer dedicated GSC SA JSON; fall back to GA scorecard SA (same SA is fine).
sa_raw=""
sa_raw="$(az keyvault secret show --vault-name "$vault" --name GSC-DATA-API-SA-JSON --query value -o tsv 2>/dev/null || true)"
sa_raw="$(printf '%s' "$sa_raw" | tr -d '\r')"
if [[ -n "$sa_raw" && "$sa_raw" != "REPLACE_ME" ]]; then
  write_sa_file "$sa_raw"
  echo "Loaded GSC-DATA-API-SA-JSON into a temp file for search-ops (path not containing the secret body)."
  exit 0
fi

echo "GSC-DATA-API-SA-JSON missing or REPLACE_ME — trying GA-DATA-API-SA-JSON fallback."
sa_raw="$(az keyvault secret show --vault-name "$vault" --name GA-DATA-API-SA-JSON --query value -o tsv 2>/dev/null || true)"
sa_raw="$(printf '%s' "$sa_raw" | tr -d '\r')"
if [[ -z "$sa_raw" || "$sa_raw" == "REPLACE_ME" ]]; then
  emit_env GSC_DATA_API_SA_JSON_FILE ""
  echo "GA-DATA-API-SA-JSON also missing or REPLACE_ME — GSC section will be stale (no SA default)."
  exit 0
fi

write_sa_file "$sa_raw"
echo "Loaded GA-DATA-API-SA-JSON as GSC SA fallback into a temp file (path not containing the secret body)."
