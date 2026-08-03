#!/usr/bin/env bash
# Fetch SITE-* + Turnstile site key from Key Vault into GITHUB_ENV for Astro builds.
# Requires: az login, AZURE_KEY_VAULT_NAME, and Key Vault Secrets User on the vault.
set -euo pipefail

vault="${AZURE_KEY_VAULT_NAME:-}"
if [[ -z "$vault" ]]; then
  echo "::error::AZURE_KEY_VAULT_NAME is not set (GitHub environment variable from Terraform)."
  exit 1
fi

fetch() {
  local name="$1"
  local env_name="$2"
  local value
  value=$(az keyvault secret show --vault-name "$vault" --name "$name" --query value -o tsv)
  if [[ -z "$value" || "$value" == "REPLACE_ME" ]]; then
    echo "::error::Key Vault secret ${name} in ${vault} is missing or still REPLACE_ME. Set it per docs/runbooks/rotate-secrets.md."
    exit 1
  fi
  echo "::add-mask::${value}"
  echo "${env_name}=${value}" >> "$GITHUB_ENV"
}

fetch SITE-CONTACT-EMAIL SITE_CONTACT_EMAIL
fetch SITE-CONTACT-PHONE SITE_CONTACT_PHONE
fetch SITE-DATE-OF-BIRTH SITE_DATE_OF_BIRTH
# Public widget key (still stored in KV so all Turnstile values live in one place).
fetch TURNSTILE-SITE-KEY PUBLIC_TURNSTILE_SITE_KEY

echo "Loaded SITE_* and PUBLIC_TURNSTILE_SITE_KEY from ${vault}."
