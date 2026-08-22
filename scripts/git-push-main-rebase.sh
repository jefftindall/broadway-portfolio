#!/usr/bin/env bash
# Push the current HEAD commit to origin/main, rebasing onto the latest tip first.
#
# Used by Ops/Search monthly workflows that refresh artifacts over a long probe
# window, then commit as the Studio GitHub App. Concurrent merges to main while
# the job runs cause non-fast-forward rejects; rebase + retry fixes that without
# force-push.
#
# Prerequisites:
#   - Already committed local changes on the current branch
#   - git remote `origin` authenticated for push (App http.extraheader)
#   - Never prints tokens/secrets
#
# Notes:
#   Rebase uses --autostash so incidental working-tree dirt (e.g. chmod +x on
#   scripts still stored as non-executable in git) cannot block the rebase.
#
# Usage:
#   ./scripts/git-push-main-rebase.sh
#   ./scripts/git-push-main-rebase.sh --message "context for logs"

set -euo pipefail
set +x

msg=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --message)
      msg="${2:-}"
      shift 2
      ;;
    -h | --help)
      echo "Usage: $0 [--message TEXT]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

label="${msg:-HEAD}"
max_attempts=5
attempt=1

while ((attempt <= max_attempts)); do
  echo "Fetching origin/main (attempt ${attempt}/${max_attempts}) for ${label}…"
  git fetch origin main

  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Working tree has local changes before rebase; using --autostash:"
    git status --porcelain
  fi

  if ! git rebase --autostash origin/main; then
    echo "::error::Rebase onto origin/main failed (conflict or other error). Resolve manually; not force-pushing."
    git status --porcelain || true
    git rebase --abort 2>/dev/null || true
    exit 1
  fi

  if git push origin HEAD:main; then
    echo "Pushed ${label} to main (attempt ${attempt})."
    exit 0
  else
    push_status=$?
    echo "Push rejected (exit ${push_status}); retrying after fresh fetch…"
  fi

  attempt=$((attempt + 1))
  sleep $((attempt * 2))
done

echo "::error::Failed to push ${label} to main after ${max_attempts} rebase attempts."
exit 1
