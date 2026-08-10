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

# Ops ALERT-* (bootstrap shared_kv.tf): must exist. REPLACE_ME skips Action Group
# receivers at terraform apply (OPS-P1); warn so operators know paging is off.
check_alert() {
  local name="$1"
  local value
  if ! value=$(az keyvault secret show --vault-name "$vault" --name "$name" --query value -o tsv 2>/dev/null); then
    warn "Secret ${name} is missing in ${vault} (apply infra/bootstrap shared_kv.tf)."
    return
  fi
  if [[ -z "$value" || "$value" == "REPLACE_ME" ]]; then
    echo "::warning title=Shared Key Vault::${name} is still REPLACE_ME — Action Group receivers for that channel are skipped (see docs/runbooks/rotate-secrets.md ops ALERT-*)."
  else
    echo "OK ${name}"
  fi
}

check_alert ALERT-EMAIL
check_alert ALERT-SMS-PHONE
check_alert ALERT-VOICE-PHONE

# GA Data API (OPS-P5-002): must exist. REPLACE_ME → visits/top pages stay stale
# until populated (see docs/runbooks/ga-data-api-access.md). Does not block CD.
check_ga() {
  local name="$1"
  local value
  if ! value=$(az keyvault secret show --vault-name "$vault" --name "$name" --query value -o tsv 2>/dev/null); then
    warn "Secret ${name} is missing in ${vault} (apply infra/bootstrap shared_kv.tf)."
    return
  fi
  if [[ -z "$value" || "$value" == "REPLACE_ME" ]]; then
    echo "::warning title=Shared Key Vault::${name} is still REPLACE_ME — scorecard visits/top pages stay stale until set (see docs/runbooks/ga-data-api-access.md)."
  else
    echo "OK ${name}"
  fi
}

check_ga GA-PROPERTY-ID
check_ga GA-DATA-API-SA-JSON

# GSC Search Analytics (SEARCH-P4-001): site URL must be set for monthly signals.
# GSC-DATA-API-SA-JSON may stay REPLACE_ME when reusing GA-DATA-API-SA-JSON.
check_gsc_site() {
  local name="GSC-SITE-URL"
  local value
  if ! value=$(az keyvault secret show --vault-name "$vault" --name "$name" --query value -o tsv 2>/dev/null); then
    warn "Secret ${name} is missing in ${vault} (apply infra/bootstrap shared_kv.tf)."
    return
  fi
  if [[ -z "$value" || "$value" == "REPLACE_ME" ]]; then
    echo "::notice title=Shared Key Vault::${name} is missing/REPLACE_ME — search-ops defaults to https://elysetindall.com/ at runtime (see docs/runbooks/gsc-data-api-access.md)."
  else
    echo "OK ${name}"
  fi
}

check_gsc_sa() {
  local name="GSC-DATA-API-SA-JSON"
  local value
  if ! value=$(az keyvault secret show --vault-name "$vault" --name "$name" --query value -o tsv 2>/dev/null); then
    warn "Secret ${name} is missing in ${vault} (apply infra/bootstrap shared_kv.tf)."
    return
  fi
  if [[ -z "$value" || "$value" == "REPLACE_ME" ]]; then
    echo "::notice title=Shared Key Vault::${name} is REPLACE_ME — search-ops will fall back to GA-DATA-API-SA-JSON when that SA has GSC access (see docs/runbooks/gsc-data-api-access.md)."
  else
    echo "OK ${name}"
  fi
}

check_gsc_site
check_gsc_sa

# SMS from is optional for Build release (email-only until set); warn separately.
sms_from=""
if ! sms_from=$(az keyvault secret show --vault-name "$vault" --name ACS-SMS-FROM --query value -o tsv 2>/dev/null); then
  warn "Secret ACS-SMS-FROM is missing in ${vault} (bootstrap shared_acs.tf)."
elif [[ -z "$sms_from" || "$sms_from" == "REPLACE_ME" ]]; then
  echo "::warning title=Shared Key Vault::ACS-SMS-FROM is still REPLACE_ME — email works; SMS is skipped until a toll-free number is set (see rotate-secrets.md)."
  # Do not count toward "CD Build will fail" missing tally for SITE/Turnstile.
else
  echo "OK ACS-SMS-FROM"
fi

if [[ "$missing" -eq 0 ]]; then
  echo "All shared deploy secrets look populated."
else
  echo "Shared secret check finished with warnings (CD will fail until SITE/Turnstile are set)."
fi
exit 0
