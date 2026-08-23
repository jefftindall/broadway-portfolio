#!/usr/bin/env bash
# Staging deploy seed for Studio People (after Terraform, before SWA upload).
# Prod is a no-op. Never prints connection strings, allowlist values, or PII.
#
# Usage:
#   ./scripts/seed-studio-people.sh staging
#
# Requires: az logged in, Node, api/ node_modules.
# Staging storage: stelysecrmstaging. One CRM per environment — no owner list.

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
ACCOUNT="stelysecrmstaging"

conn_file="$(mktemp)"
cleanup() {
  rm -f "$conn_file"
}
trap cleanup EXIT
chmod 600 "$conn_file"

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

export STUDIO_CRM_STORAGE_CONNECTION_STRING_FILE="$conn_file"
export STUDIO_CRM_TABLE_NAME="${STUDIO_CRM_TABLE_NAME:-contacts}"
node "$ROOT/scripts/seed-studio-people.mjs"
