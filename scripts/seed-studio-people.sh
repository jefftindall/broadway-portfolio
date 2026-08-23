#!/usr/bin/env bash
# Staging deploy seed for Studio People (after Terraform, before SWA upload).
# Prod is a no-op. Never prints connection strings, allowlist values, or PII.
#
# Usage:
#   ./scripts/seed-studio-people.sh staging
#
# Requires: az logged in, Node, api/ node_modules, jq not required.
# Staging storage: stelysecrmstaging. Owners: ALLOWED-USER-IDS object ids (Graph lookup when the token is an email).

set -euo pipefail
set +x

ENV="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$ENV" == "prod" ]]; then
  echo "Studio People seed: skip prod."
  exit 0
fi

if [[ "$ENV" != "staging" && "$ENV" != "local" ]]; then
  echo "Usage: $0 staging|local|prod" >&2
  exit 1
fi

mask_file_lines() {
  local file="$1"
  if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
    return 0
  fi
  while IFS= read -r line || [[ -n "${line:-}" ]]; do
    [[ -z "$line" ]] && continue
    echo "::add-mask::${line}"
  done < "$file"
}

if [[ "$ENV" == "local" ]]; then
  exec node "$ROOT/scripts/seed-studio-people.mjs"
fi

RG="${AZURE_RESOURCE_GROUP:-rg-elyse-portfolio-staging}"
VAULT="${AZURE_KEY_VAULT_NAME:-kv-elyse-staging}"
ACCOUNT="stelysecrmstaging"

conn_file="$(mktemp)"
owners_file="$(mktemp)"
cleanup() {
  rm -f "$conn_file" "$owners_file"
}
trap cleanup EXIT
chmod 600 "$conn_file" "$owners_file"

echo "Studio People seed: fetching Table Storage connection for ${ACCOUNT} (value not logged)."
if ! az storage account show-connection-string \
  --name "$ACCOUNT" \
  --resource-group "$RG" \
  --query connectionString -o tsv > "$conn_file"; then
  echo "Studio People seed failed (storage_connection). Account ${ACCOUNT} in ${RG}." >&2
  exit 1
fi
# Strip CR from Azure CLI tsv
tr -d '\r' < "$conn_file" > "${conn_file}.tmp" && mv "${conn_file}.tmp" "$conn_file"
chmod 600 "$conn_file"
mask_file_lines "$conn_file"

echo "Studio People seed: resolving owners from ${VAULT} ALLOWED-USER-IDS (values not logged)."
allowlist="$(az keyvault secret show --vault-name "$VAULT" --name ALLOWED-USER-IDS --query value -o tsv 2>/dev/null || true)"
allowlist="$(printf '%s' "$allowlist" | tr -d '\r')"
if [[ -z "$allowlist" || "$allowlist" == "REPLACE_ME" ]]; then
  echo "Studio People seed failed (missing_owners). Populate ALLOWED-USER-IDS in ${VAULT}." >&2
  exit 1
fi

IFS=',' read -r -a tokens <<< "$allowlist"
resolved=0
for raw in "${tokens[@]}"; do
  token="$(printf '%s' "$raw" | xargs)"
  [[ -z "$token" || "$token" == "REPLACE_ME" ]] && continue
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "::add-mask::${token}"
  fi
  owner="$token"
  if [[ ! "$token" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
    looked_up="$(az ad user show --id "$token" --query id -o tsv 2>/dev/null || true)"
    looked_up="$(printf '%s' "$looked_up" | tr -d '\r')"
    if [[ -n "$looked_up" ]]; then
      if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
        echo "::add-mask::${looked_up}"
      fi
      owner="$looked_up"
    fi
  fi
  printf '%s\n' "$owner" >> "$owners_file"
  resolved=$((resolved + 1))
done

if [[ ! -s "$owners_file" ]]; then
  echo "Studio People seed failed (missing_owners). No usable ALLOWED-USER-IDS tokens." >&2
  exit 1
fi

echo "Studio People seed: owners=${resolved}."
export STUDIO_CRM_STORAGE_CONNECTION_STRING_FILE="$conn_file"
export STUDIO_CRM_OWNERS_FILE="$owners_file"
export STUDIO_CRM_TABLE_NAME="${STUDIO_CRM_TABLE_NAME:-contacts}"
node "$ROOT/scripts/seed-studio-people.mjs"
