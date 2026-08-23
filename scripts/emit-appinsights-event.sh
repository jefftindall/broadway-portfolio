#!/usr/bin/env bash
# Emit a custom event to Application Insights without printing secrets.
# Usage: emit-appinsights-event.sh <EventName>
# Env: APPINSIGHTS_CONNECTION_STRING (required to send)
#      DEPLOY_ENVIRONMENT, GIT_SHA, JOB_NAME, RUN_URL (optional properties)
# Never echo the connection string, instrumentation key, or payload.

set -euo pipefail

EVENT_NAME="${1:-}"

if [[ ! "$EVENT_NAME" =~ ^[A-Za-z][A-Za-z0-9]{0,63}$ ]]; then
  echo "Usage: $0 <EventName> (letters/digits, e.g. DeployStarted)" >&2
  exit 2
fi

if [[ -z "${APPINSIGHTS_CONNECTION_STRING:-}" ]]; then
  echo "No App Insights connection string; skipping ${EVENT_NAME}."
  exit 0
fi

cs="${APPINSIGHTS_CONNECTION_STRING}"
ikey_rest="${cs#*InstrumentationKey=}"
if [[ "$ikey_rest" == "$cs" || -z "$ikey_rest" ]]; then
  echo "APPINSIGHTS_CONNECTION_STRING missing InstrumentationKey; skip ${EVENT_NAME}." >&2
  exit 1
fi
ikey="${ikey_rest%%;*}"

endpoint_rest="${cs#*IngestionEndpoint=}"
if [[ "$endpoint_rest" == "$cs" ]]; then
  endpoint="https://dc.services.visualstudio.com"
else
  endpoint="${endpoint_rest%%;*}"
fi
endpoint="${endpoint%/}"

if [[ -z "$ikey" || -z "$endpoint" ]]; then
  echo "Could not parse App Insights connection string; skip ${EVENT_NAME}." >&2
  exit 1
fi

if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && printf '::add-mask::%s\n' "$line"
  done <<< "$ikey"
fi

payload_file="$(mktemp)"
trap 'rm -f "$payload_file"' EXIT
chmod 600 "$payload_file"

export EVENT_NAME
export AI_IKEY="$ikey"
export DEPLOY_ENVIRONMENT="${DEPLOY_ENVIRONMENT:-}"
export GIT_SHA="${GIT_SHA:-}"
export JOB_NAME="${JOB_NAME:-}"
export RUN_URL="${RUN_URL:-}"

python3 - "$payload_file" <<'PY'
import json, os, sys
from datetime import datetime, timezone

path = sys.argv[1]
props = {
    "environment": os.environ.get("DEPLOY_ENVIRONMENT", ""),
    "sha": os.environ.get("GIT_SHA", ""),
    "job": os.environ.get("JOB_NAME", ""),
}
run_url = os.environ.get("RUN_URL", "")
if run_url:
    props["runUrl"] = run_url

payload = [{
    "name": "Microsoft.ApplicationInsights.Event",
    "time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    "iKey": os.environ["AI_IKEY"],
    "data": {
        "baseType": "EventData",
        "baseData": {
            "ver": 2,
            "name": os.environ["EVENT_NAME"],
            "properties": props,
        },
    },
}]
with open(path, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, separators=(",", ":"))
PY

# Drop the key from the environment before curl so `set -x` cannot leak it.
unset AI_IKEY APPINSIGHTS_CONNECTION_STRING cs ikey ikey_rest endpoint_rest

curl -sS -X POST "${endpoint}/v2/track" \
  -H "Content-Type: application/json" \
  --data-binary "@${payload_file}" \
  -o /dev/null

echo "Emitted ${EVENT_NAME}."
