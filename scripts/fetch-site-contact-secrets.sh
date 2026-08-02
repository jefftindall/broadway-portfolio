#!/usr/bin/env bash
# Fetch SITE-* contact secrets from Key Vault into GITHUB_ENV for Astro builds.
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

echo "Loaded SITE_* contact secrets from ${vault}."
