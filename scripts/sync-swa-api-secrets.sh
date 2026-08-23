#!/usr/bin/env bash
# Sync Key Vault secret values into SWA app settings for managed Functions.
#
# SWA managed Functions do NOT resolve @Microsoft.KeyVault(...) references —
# they see the literal string. Keep secrets in Key Vault as source of truth,
# then copy resolved values into SWA configuration (AAD_CLIENT_SECRET stays a
# Key Vault reference; the SWA auth platform resolves that one).
#
# Shared (bootstrap kv-elyse-shared): SITE-CONTACT-*, TURNSTILE-SECRET-KEY, ACS-*,
# Stripe TEST/LIVE API keys
# Per-env vault: Gemini, GitHub App, allowlist, AAD, Stripe webhook secret, Payment Links
#
# Usage:
#   ./scripts/sync-swa-api-secrets.sh staging
#   ./scripts/sync-swa-api-secrets.sh prod
#
# Requires: az CLI logged in, jq, Key Vault Secrets Officer (or get) on both vaults.
# ARM: POST .../listAppSettings then PUT .../config/appsettings (GET on that path is 405).
#
# LESSON_PAYMENTS_ENABLED is Terraform-managed (staging true, prod false until go-live)
# and is preserved here — this script does not overwrite that flag.

set -euo pipefail

ENV="${1:-}"
SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID:-e601e59a-c7f4-41f0-8178-b59740fb1974}"
SHARED_VAULT="${AZURE_SHARED_KEY_VAULT_NAME:-kv-elyse-shared}"

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

# Shared ACS; SMS sends only when ACS-SMS-FROM is a real E.164 number (not REPLACE_ME).
CONTACT_SMS_ENABLED="true"

az account set --subscription "$SUBSCRIPTION_ID"

kv_value() {
  az keyvault secret show --vault-name "$1" --name "$2" --query value -o tsv
}

echo "Reading env secrets from $VAULT and shared secrets from $SHARED_VAULT..."
GEMINI="$(kv_value "$VAULT" GEMINI-API-KEY)"
GH_APP_ID="$(kv_value "$VAULT" GITHUB-APP-ID)"
GH_INSTALL="$(kv_value "$VAULT" GITHUB-APP-INSTALLATION-ID)"
GH_KEY="$(kv_value "$VAULT" GITHUB-APP-PRIVATE-KEY)"
ALLOWLIST="$(kv_value "$VAULT" ALLOWED-USER-IDS)"
ACS_CS="$(kv_value "$SHARED_VAULT" ACS-CONNECTION-STRING)"
ACS_SENDER="$(kv_value "$SHARED_VAULT" ACS-EMAIL-SENDER)"
ACS_SMS_FROM="$(kv_value "$SHARED_VAULT" ACS-SMS-FROM)"
NOTIFY_EMAIL="$(kv_value "$SHARED_VAULT" SITE-CONTACT-EMAIL)"
NOTIFY_PHONE="$(kv_value "$SHARED_VAULT" SITE-CONTACT-PHONE)"
TURNSTILE_SECRET="$(kv_value "$SHARED_VAULT" TURNSTILE-SECRET-KEY)"
if [[ "$ENV" == "prod" ]]; then
  STRIPE_PREFIX="STRIPE-LIVE"
else
  STRIPE_PREFIX="STRIPE-TEST"
fi
STRIPE_SECRET="$(kv_value "$SHARED_VAULT" "${STRIPE_PREFIX}-SECRET-KEY")"
STRIPE_PUBLISHABLE="$(kv_value "$SHARED_VAULT" "${STRIPE_PREFIX}-PUBLISHABLE-KEY")"
STRIPE_WEBHOOK="$(kv_value "$VAULT" STRIPE-WEBHOOK-SECRET)"
STRIPE_LINK_30="$(kv_value "$VAULT" STRIPE-PAYMENT-LINK-30MIN)"
STRIPE_LINK_60="$(kv_value "$VAULT" STRIPE-PAYMENT-LINK-60MIN)"
AAD_REF="@Microsoft.KeyVault(SecretUri=https://${VAULT}.vault.azure.net/secrets/AAD-CLIENT-SECRET/)"

# List is POST listAppSettings — GET on config/appsettings returns 405.
API_VERSION="2023-01-01"
LIST_URL="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.Web/staticSites/${SWA}/listAppSettings?api-version=${API_VERSION}"
CONFIG_URL="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG}/providers/Microsoft.Web/staticSites/${SWA}/config/appsettings?api-version=${API_VERSION}"

echo "Merging into $SWA app settings (preserving other keys)..."
CURRENT="$(az rest --method post --url "$LIST_URL")"

BODY_FILE="$(mktemp)"
chmod 600 "$BODY_FILE"
cleanup_body() { rm -f "$BODY_FILE"; }
trap cleanup_body EXIT

jq -n \
  --argjson current "$CURRENT" \
  --arg gemini "$GEMINI" \
  --arg gh_app_id "$GH_APP_ID" \
  --arg gh_install "$GH_INSTALL" \
  --arg gh_key "$GH_KEY" \
  --arg allowlist "$ALLOWLIST" \
  --arg aad_ref "$AAD_REF" \
  --arg acs_cs "$ACS_CS" \
  --arg acs_sender "$ACS_SENDER" \
  --arg notify_email "$NOTIFY_EMAIL" \
  --arg notify_phone "$NOTIFY_PHONE" \
  --arg acs_sms_from "$ACS_SMS_FROM" \
  --arg turnstile_secret "$TURNSTILE_SECRET" \
  --arg contact_sms_enabled "$CONTACT_SMS_ENABLED" \
  --arg stripe_secret "$STRIPE_SECRET" \
  --arg stripe_publishable "$STRIPE_PUBLISHABLE" \
  --arg stripe_webhook "$STRIPE_WEBHOOK" \
  --arg stripe_link_30 "$STRIPE_LINK_30" \
  --arg stripe_link_60 "$STRIPE_LINK_60" \
  '
  ($current.properties // {}) as $p
  | {
      kind: "appsettings",
      properties: (
        $p
        + {
            GEMINI_API_KEY: $gemini,
            GITHUB_APP_ID: $gh_app_id,
            GITHUB_APP_INSTALLATION_ID: $gh_install,
            GITHUB_APP_PRIVATE_KEY: $gh_key,
            ALLOWED_USER_IDS: $allowlist,
            AAD_CLIENT_SECRET: $aad_ref,
            ACS_CONNECTION_STRING: $acs_cs,
            ACS_EMAIL_SENDER: $acs_sender,
            CONTACT_NOTIFY_EMAIL: $notify_email,
            CONTACT_NOTIFY_PHONE: $notify_phone,
            ACS_SMS_FROM: $acs_sms_from,
            CONTACT_SMS_ENABLED: $contact_sms_enabled,
            TURNSTILE_SECRET: $turnstile_secret,
            STRIPE_SECRET_KEY: $stripe_secret,
            STRIPE_PUBLISHABLE_KEY: $stripe_publishable,
            STRIPE_WEBHOOK_SECRET: $stripe_webhook,
            STRIPE_PAYMENT_LINK_30MIN: $stripe_link_30,
            STRIPE_PAYMENT_LINK_60MIN: $stripe_link_60
          }
      )
    }
  ' > "$BODY_FILE"

az rest --method put --url "$CONFIG_URL" --body "@${BODY_FILE}" --headers "Content-Type=application/json" --output none
echo "Synced API secrets ($VAULT + $SHARED_VAULT) → $SWA (AAD_CLIENT_SECRET left as Key Vault reference)."
