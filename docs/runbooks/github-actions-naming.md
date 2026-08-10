# Runbook: GitHub Actions naming (Scheme A)

Canonical naming for workflows under [`.github/workflows/`](../../.github/workflows/). Display `name:` values follow **Scheme A** today; filenames are still legacy (tech debt below).

## Scheme A (codified)

Filename pattern (target state): `<area>-<purpose>[-cadence].yml`

Display `name:` pattern (current requirement): `"<Area>: <purpose>"`

| Prefix | Area label | Meaning |
|--------|------------|---------|
| `ci-` | `CI` | PR / push checks (no deploy) |
| `cd-` | `CD` | Deploy / promote |
| `ops-` | `Ops` | Reliability, secrets sync, scorecard |
| `search-` | `Search` | SEO / analytics signal extract |
| `maint-` | `Maint` | Housekeeping (branch cleanup, etc.) |

Rules:

1. Prefer Scheme A for every **new** workflow (file + display name).
2. Keep plan IDs (`OPS-*`, `SEARCH-*`, `TEST-*`) in comments and docs — **not** in the Actions display `name:`.
3. Do not use product marketing titles (e.g. “Azure Static Web Apps CI/CD”) or vague nouns (e.g. “Staging branch”) as the workflow `name:`.
4. Job `name:` values (checks shown in PRs) stay descriptive and stable (`Terraform lint`, `Smoke Staging`, …) unless branch protection must change with them.
5. When renaming a **file**, GitHub treats it as a new workflow; update path filters, docs, Studio copy, and this table in the same PR.

## Current inventory (file vs display)

| File (unchanged for now) | Display `name:` | Trigger |
|--------------------------|-----------------|---------|
| [`static-analysis.yml`](../../.github/workflows/static-analysis.yml) | `CI: static analysis` | PR + push `main` |
| [`azure-static-web-apps.yml`](../../.github/workflows/azure-static-web-apps.yml) | `CD: main` | push `main` + dispatch |
| [`staging-branch.yml`](../../.github/workflows/staging-branch.yml) | `CD: staging` | dispatch |
| [`sync-swa-api-secrets.yml`](../../.github/workflows/sync-swa-api-secrets.yml) | `Ops: sync SWA secrets` | dispatch |
| [`ops-scorecard-monthly.yml`](../../.github/workflows/ops-scorecard-monthly.yml) | `Ops: monthly scorecard` | cron 1st + dispatch |
| [`search-ops-monthly.yml`](../../.github/workflows/search-ops-monthly.yml) | `Search: monthly signals` | cron 1st + dispatch |
| [`cleanup-staging-studio-branches.yml`](../../.github/workflows/cleanup-staging-studio-branches.yml) | `Maint: cleanup Studio branches` | daily cron + dispatch |

## Tech debt: rename files to match Scheme A

Display names already match Scheme A. **Filenames do not** — rename in a later PR (history resets per path on GitHub).

| Current file | Target file | Notes |
|--------------|-------------|-------|
| `static-analysis.yml` | `ci-static-analysis.yml` | Update CD infra path-filter list |
| `azure-static-web-apps.yml` | `cd-main.yml` | Update path filters that list this file; many doc links |
| `staging-branch.yml` | `cd-staging.yml` | Studio PR body / UI strings already say **CD: staging** |
| `sync-swa-api-secrets.yml` | `ops-sync-swa-secrets.yml` | Script name can stay |
| `ops-scorecard-monthly.yml` | *(already aligned)* | Optional: leave as-is |
| `search-ops-monthly.yml` | `search-signals-monthly.yml` | Align with display “signals” |
| `cleanup-staging-studio-branches.yml` | `maint-cleanup-studio-branches.yml` | Script comment references path |

Optional follow-ups in the same rename PR: align concurrency group ids with filenames; keep `portfolio-cd` shared by `CD: main` and `CD: staging` unless you intentionally split deploy locks.

## Removed / ghost workflows

| Former display name | Path | Status |
|---------------------|------|--------|
| Terraform CI | `.github/workflows/terraform.yml` | **Deleted from git** (lint/plan live in `CI: static analysis`; apply lives in CD). If Actions still lists it as active, disable the ghost workflow (repo admin): Actions → Terraform CI → `…` → Disable workflow, or `PUT /repos/{owner}/{repo}/actions/workflows/{id}/disable`. |

Do **not** re-add `terraform.yml`.

## Operator cheat sheet

| Task | Actions → |
|------|-----------|
| PR / main checks | **CI: static analysis** |
| Promote `main` (or re-run full CD) | **CD: main** |
| Preview a branch on staging SWA | **CD: staging** |
| After rotating API vault secrets | **Ops: sync SWA secrets** |
| Re-run monthly scorecard / digest | **Ops: monthly scorecard** |
| Re-run GSC/GA signal extract | **Search: monthly signals** |
| Force Studio branch cleanup | **Maint: cleanup Studio branches** |

Related: [deploy-and-rollback.md](deploy-and-rollback.md), [setup.md](../setup.md), [rotate-secrets.md](rotate-secrets.md).
