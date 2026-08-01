#!/usr/bin/env bash
# Sync Key Vault secret values into SWA app settings for managed Functions.
#
# SWA managed Functions do NOT resolve @Microsoft.KeyVault(...) references —
# they see the literal string. Keep secrets in Key Vault as source of truth,
# then copy resolved values into SWA configuration (AAD_CLIENT_SECRET stays a
# Key Vault reference; the SWA auth platform resolves that one).
#
# Usage:
#   ./scripts/sync-swa-api-secrets.sh staging
#   ./scripts/sync-swa-api-secrets.sh prod
#
# Requires: az CLI logged in, jq, Key Vault Secrets Officer (or get) on the vault.

set -euo pipefail

ENV="${1:-}"
SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID:-e601e59a-c7f4-41f0-8178-b59740fb1974}"

case "$ENV" in
  staging)
    VAULT="kv-elyse-staging"
    SWA="swa-elyse-portfolio-staging"
    RG="rg-elyse-portfolio-staging"
    ;;
  prod)
    VAULT="kv-elyse-prod"
    SWA="swa-elyse-portfolio-prod"
    RG="rg-elyse-portfolio-prod"
    ;;
  *)
    echo "Usage: $0 staging|prod" >&2
    exit 1
    ;;
esac

az account set --subscription "$SUBSCRIPTION_ID"

kv_value() {
  az keyvault secret show --vault-name "$VAULT" --name "$1" --query value -o tsv
}

echo "Reading secrets from $VAULT..."
GEMINI="$(kv_value GEMINI-API-KEY)"
GH_APP_ID="$(kv_value GITHUB-APP-ID)"
GH_INSTALL="$(kv_value GITHUB-APP-INSTALLATION-ID)"
GH_KEY="$(kv_value GITHUB-APP-PRIVATE-KEY)"
ALLOWLIST="$(kv_value ALLOWED-USER-IDS)"
AAD_REF="@Microsoft.KeyVault(SecretUri=https://${VAULT}.vault.azure.net/secrets/AAD-CLIENT-SECRET/)"

CONFIG_URL="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.Web/staticSites/${SWA}/config/appsettings?api-version=2023-01-01"

echo "Merging into $SWA app settings (preserving other keys)..."
CURRENT="$(az rest --method get --url "$CONFIG_URL")"

BODY="$(
  jq -n \
    --argjson current "$CURRENT" \
    --arg gemini "$GEMINI" \
    --arg gh_app_id "$GH_APP_ID" \
    --arg gh_install "$GH_INSTALL" \
    --arg gh_key "$GH_KEY" \
    --arg allowlist "$ALLOWLIST" \
    --arg aad_ref "$AAD_REF" \
    '
    ($current.properties // {}) as $p
    | {
        properties: (
          $p
          + {
              GEMINI_API_KEY: $gemini,
              GITHUB_APP_ID: $gh_app_id,
              GITHUB_APP_INSTALLATION_ID: $gh_install,
              GITHUB_APP_PRIVATE_KEY: $gh_key,
              ALLOWED_USER_IDS: $allowlist,
              AAD_CLIENT_SECRET: $aad_ref
            }
        )
      }
    '
)"

az rest --method put --url "$CONFIG_URL" --body "$BODY" --output none
echo "Synced API secrets from $VAULT → $SWA (AAD_CLIENT_SECRET left as Key Vault reference)."
