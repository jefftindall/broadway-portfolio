#!/usr/bin/env bash
# One-off: copy Stripe API keys from environment vaults into kv-elyse-shared.
# Does not create a Terraform dependency — bootstrap never data-sources env vaults.
# Webhook secrets and Payment Links stay in env vaults (written by env Terraform).
#
# Prerequisites: bootstrap apply has created the shared STRIPE-TEST-* / STRIPE-LIVE-*
# key placeholders. Then apply staging (test keys) and prod (live keys) so each
# environment can create its catalog.
#
# Usage: ./scripts/copy-stripe-keys-to-shared-kv.sh
#
# Never prints secret values.

set -euo pipefail

SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID:-e601e59a-c7f4-41f0-8178-b59740fb1974}"
SHARED_VAULT="${AZURE_SHARED_KEY_VAULT_NAME:-kv-elyse-shared}"
STAGING_VAULT="kv-elyse-staging"
PROD_VAULT="kv-elyse-prod"

az account set --subscription "$SUBSCRIPTION_ID"

kv_exists() {
  az keyvault secret show --vault-name "$1" --name "$2" --query name -o tsv >/dev/null 2>&1
}

copy_secret() {
  local src_vault="$1"
  local src_name="$2"
  local dest_vault="$3"
  local dest_name="$4"
  local tmp

  if ! kv_exists "$dest_vault" "$dest_name"; then
    echo "Missing destination ${dest_vault}/${dest_name}. Apply infra/bootstrap first." >&2
    return 1
  fi

  if ! kv_exists "$src_vault" "$src_name"; then
    echo "Skip ${src_vault}/${src_name} (not found)." >&2
    return 0
  fi

  tmp="$(mktemp)"
  chmod 600 "$tmp"

  az keyvault secret show --vault-name "$src_vault" --name "$src_name" --query value -o tsv | tr -d '\r\n' >"$tmp"
  if ! grep -q '[^[:space:]]' "$tmp"; then
    echo "Skip ${src_vault}/${src_name} (empty)." >&2
    rm -f "$tmp"
    return 0
  fi
  if grep -qx 'REPLACE_ME' "$tmp"; then
    echo "Skip ${src_vault}/${src_name} (still REPLACE_ME)." >&2
    rm -f "$tmp"
    return 0
  fi

  az keyvault secret set --vault-name "$dest_vault" --name "$dest_name" --file "$tmp" --output none
  rm -f "$tmp"
  echo "Copied ${src_vault}/${src_name} → ${dest_vault}/${dest_name}."
}

echo "Copying Stripe API keys into ${SHARED_VAULT} (values never printed)..."

copy_secret "$STAGING_VAULT" "STRIPE-SECRET-KEY" "$SHARED_VAULT" "STRIPE-TEST-SECRET-KEY"
copy_secret "$STAGING_VAULT" "STRIPE-PUBLISHABLE-KEY" "$SHARED_VAULT" "STRIPE-TEST-PUBLISHABLE-KEY"

copy_secret "$PROD_VAULT" "STRIPE-SECRET-KEY" "$SHARED_VAULT" "STRIPE-LIVE-SECRET-KEY"
copy_secret "$PROD_VAULT" "STRIPE-PUBLISHABLE-KEY" "$SHARED_VAULT" "STRIPE-LIVE-PUBLISHABLE-KEY"

echo "Done. Apply staging Terraform (test catalog) then prod (live catalog)."
echo "Do not copy webhook secrets or Payment Links — env stacks write those to kv-elyse-staging / kv-elyse-prod."
