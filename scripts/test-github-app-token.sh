#!/usr/bin/env bash
# Local dry-run: mint a Studio GitHub App installation token from Key Vault and
# verify it can access this repo with Contents:write — without pushing.
#
# Never prints tokens, PEMs, or Key Vault secret values.
#
# Usage (Git Bash / Linux / macOS; Azure CLI logged in with Key Vault access):
#   export AZURE_KEY_VAULT_NAME=kv-elyse-prod   # or kv-elyse-staging
#   ./scripts/test-github-app-token.sh
#   ./scripts/test-github-app-token.sh --vault kv-elyse-prod
#
# Optional:
#   GITHUB_REPOSITORY=owner/repo  (default: jefftindall/broadway-portfolio)
set -euo pipefail
set +x

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VAULT="${AZURE_KEY_VAULT_NAME:-${VAULT:-}}"
REPO="${GITHUB_REPOSITORY:-jefftindall/broadway-portfolio}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault)
      VAULT="${2:-}"
      shift 2
      ;;
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$VAULT" ]]; then
  echo "Set AZURE_KEY_VAULT_NAME or pass --vault kv-elyse-prod" >&2
  exit 2
fi

for cmd in az curl openssl git node; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 2
  fi
done

if ! command -v gh >/dev/null 2>&1; then
  echo "Missing required command: gh (GitHub CLI)" >&2
  exit 2
fi

# jq optional — mint script falls back to node for JSON field extraction.

if ! az account show >/dev/null 2>&1; then
  echo "Azure CLI is not logged in. Run: az login" >&2
  exit 2
fi

TOKEN_FILE="$(mktemp)"
chmod 600 "$TOKEN_FILE"
OUT_FILE="$(mktemp)"
cleanup() { rm -f "$TOKEN_FILE" "$OUT_FILE"; }
trap cleanup EXIT

echo "==> Minting installation token from Key Vault '${VAULT}' (values not printed)..."
export AZURE_KEY_VAULT_NAME="$VAULT"
export GITHUB_APP_TOKEN_FILE="$TOKEN_FILE"
export GITHUB_OUTPUT="$OUT_FILE"
chmod +x scripts/mint-github-app-token.sh
./scripts/mint-github-app-token.sh

APP_ID="$(grep '^app_id=' "$OUT_FILE" | cut -d= -f2-)"
INSTALLATION_ID="$(grep '^installation_id=' "$OUT_FILE" | cut -d= -f2-)"
CONTENTS_PERM="$(grep '^contents_permission=' "$OUT_FILE" | cut -d= -f2-)"

if [[ ! -s "$TOKEN_FILE" ]]; then
  echo "FAIL: mint script did not write a token file." >&2
  exit 1
fi

TOKEN="$(cat "$TOKEN_FILE")"
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  echo "::add-mask::${TOKEN}"
fi

echo "==> Verifying installation can see ${REPO}..."
export GH_TOKEN="$TOKEN"
# Avoid a leading slash — Git Bash rewrites "/installation/..." as a filesystem path.
repos="$(gh api installation/repositories --jq '.repositories[].full_name')"
printf '%s\n' "$repos" | grep -qx "$REPO"

echo "==> Verifying Contents API read on ${REPO} (git ref)..."
sha="$(gh api "repos/${REPO}/git/ref/heads/main" --jq '.object.sha')"
echo "    main tip: ${sha:0:7}…"

echo "==> Verifying git HTTPS auth as the App (ls-remote only; no push)..."
# base64 -w0 is GNU; openssl base64 -A is portable on Git Bash / macOS.
basic="$(printf 'x-access-token:%s' "$TOKEN" | openssl base64 -e -A | tr -d '\n')"
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  echo "::add-mask::${basic}"
fi
GIT_TERMINAL_PROMPT=0 git -c "http.extraHeader=AUTHORIZATION: basic ${basic}" \
  ls-remote "https://github.com/${REPO}.git" refs/heads/main >/dev/null

echo
echo "OK — App token mint + repo access validated locally (no push performed)."
echo "  vault=${VAULT}"
echo "  app_id=${APP_ID}"
echo "  installation_id=${INSTALLATION_ID}"
echo "  contents=${CONTENTS_PERM}"
echo "  repo=${REPO}"
echo
echo "Safe to re-run OPS monthly scorecard after this passes."
