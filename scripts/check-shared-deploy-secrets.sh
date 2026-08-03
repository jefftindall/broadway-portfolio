#!/usr/bin/env bash
# Warn (do not fail) when shared foundation deploy secrets are missing or still REPLACE_ME.
# Used by Static analysis so PRs surface gaps before CD Build release fails.
#
# Requires: az login, Key Vault Secrets User (or Officer) on the shared vault.
# Env: AZURE_SHARED_KEY_VAULT_NAME (default kv-elyse-shared)
set -uo pipefail

vault="${AZURE_SHARED_KEY_VAULT_NAME:-kv-elyse-shared}"
missing=0

warn() {
  echo "::warning title=Shared Key Vault::$1"
  missing=1
}

echo "Checking shared deploy secrets in ${vault}..."

if ! az keyvault show --name "$vault" --query name -o tsv >/dev/null 2>&1; then
  warn "Vault ${vault} not found or inaccessible. Apply infra/bootstrap (shared_kv.tf) and ensure this identity has Key Vault Secrets User."
  echo "Shared secret check finished with warnings."
  exit 0
fi

check() {
  local name="$1"
  local value
  if ! value=$(az keyvault secret show --vault-name "$vault" --name "$name" --query value -o tsv 2>/dev/null); then
    warn "Secret ${name} is missing in ${vault}."
    return
  fi
  if [[ -z "$value" || "$value" == "REPLACE_ME" ]]; then
    warn "Secret ${name} in ${vault} is still REPLACE_ME — set it before CD Build release (see docs/runbooks/rotate-secrets.md)."
  else
    echo "OK ${name}"
  fi
}

check SITE-CONTACT-EMAIL
check SITE-CONTACT-PHONE
check SITE-DATE-OF-BIRTH
check TURNSTILE-SITE-KEY
check TURNSTILE-SECRET-KEY

if [[ "$missing" -eq 0 ]]; then
  echo "All shared deploy secrets look populated."
else
  echo "Shared secret check finished with warnings (CD will fail until these are set)."
fi
exit 0
