#!/usr/bin/env bash
# Print the public hostname for a Static Web App: Ready custom domain (Portal
# default, else first non-www Ready host) falling back to defaultHostname.
# Used by staging smoke so test.elysetindall.com is preferred once Ready.
# Does not print secrets.
set -euo pipefail

SWA_NAME="${1:?Static Web App name required}"
SWA_RG="${2:?Resource group required}"

DEFAULT=$(az staticwebapp show \
  --name "$SWA_NAME" \
  --resource-group "$SWA_RG" \
  --query defaultHostname -o tsv)

CUSTOM=$(az staticwebapp hostname list \
  --name "$SWA_NAME" \
  --resource-group "$SWA_RG" \
  -o json | jq -r '
    def domain: .domainName // .name // .properties.domainName // empty;
    def ready_status: .status // .properties.status // empty;
    def is_default: (.isDefault // .properties.isDefault // false) == true;
    [ .[] | select(ready_status == "Ready") ] as $ready
    | ($ready | map(select(is_default)) | .[0])
      // ($ready | map(select((domain | ascii_downcase | startswith("www.") | not))) | .[0])
      // $ready[0]
      // empty
    | if . == null then empty else domain end
  ')

if [ "$CUSTOM" = "null" ] || [ "$CUSTOM" = "None" ]; then
  CUSTOM=
fi

HOST=${CUSTOM:-$DEFAULT}
if [ -z "$HOST" ]; then
  echo "::error::Could not resolve Static Web App hostname for ${SWA_NAME}" >&2
  exit 1
fi

printf '%s\n' "$HOST"
