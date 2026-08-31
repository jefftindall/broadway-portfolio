# Runbook: Deploy and rollback

## Promotion path (staging → production)

1. Open a PR targeting `main`. Actions run **CI: static analysis** only (no deploys). If the PR touches `infra/`, **Plan staging** / **Plan prod** run after lint/checks and comment the plan on the PR.
2. Review the plan (when present) and merge when ready.
3. On merge to `main`, **CD: main** runs when app or infra paths changed (not on docs-only updates):
   - **Build release** once (in parallel with staging Terraform when infra changed)
   - If `infra/` changed: **Terraform apply staging**, then **Deploy Staging** (from artifact), then **Smoke Staging**, then **Terraform apply prod**, then **Deploy Production** (same artifact), then **Smoke Production**
   - If only app paths changed: **Deploy Staging** → **Smoke Staging** → **Deploy Production** → **Smoke Production** (Terraform apply jobs skipped)
   - If neither changed (e.g. `docs/` only): CD jobs are skipped; **CI: static analysis** still runs on the push

CD workflows share concurrency group `portfolio-cd` (`cancel-in-progress: false`), so **CD: main** and **CD: staging** never deploy at the same time. A second CD run waits; if more arrive while one is pending, GitHub keeps only the latest pending run. CI is unconstrained and may run in parallel across PRs.

**Smoke Staging** runs Playwright against the live staging hostname (`test.elysetindall.com` when that custom domain is Ready, else `*.azurestaticapps.net`) and **blocks** production. Journey scope depends on what changed: full suite for UI/infra changes, `@content` journeys for markdown-only updates, smoke-only for API-only changes. See [testing-strategy.md](testing-strategy.md). Production deploys the **same build artifact** that passed staging verification (staging adds crawler `noindex` on its copy only — `SEARCH-P2-008`).

**Smoke Production** (`TEST-D-003`) re-runs the same Playwright smoke suite against the live public prod host after **Deploy Production** succeeds (Ready custom domain when configured — not only `*.azurestaticapps.net`, which 301s to the default custom domain). It does **not** auto-rollback. On failure, CD emits `SmokeFailed` → `ag-elyse-notify-prod` (email + SMS; no voice).

Optional: add required reviewers on the GitHub Environment **prod** for a manual approval gate after smoke.

Branch protection should require **CI: static analysis** checks (Terraform lint / Site check / API syntax) before merge — not deploy jobs.

Workflow display names: [github-actions-naming.md](github-actions-naming.md).

## Resume PDF

`npm run build` always regenerates [`public/downloads/elyse-tindall-resume.pdf`](../../public/downloads/elyse-tindall-resume.pdf) from `src/content/shows/*.md` and [`src/content/resume-meta.json`](../../src/content/resume-meta.json) before Astro builds. After editing shows locally, run `npm run resume:pdf` and commit the PDF so the repo stays reviewable; deploy builds remain correct even if the binary was forgotten.

## Test a branch in staging (manual)

Use this for async smoke tests of infra and/or app changes without merging:

1. GitHub → Actions → **CD: staging**
2. **Run workflow** → select the branch → Run
3. The workflow applies staging Terraform from that branch, builds and deploys the staging Static Web App, then runs the same **Smoke Staging** Playwright suite (does not promote to prod)

### Studio content on a dated staging branch

Staging Studio publishes to `staging-studio-YYYYMMDD` (UTC) and opens a PR into `main` — see [github-app.md](github-app.md#staging-studio-publish-pr-mode). To preview those commits on the staging SWA before merge, run **CD: staging** against that dated branch. Merging the PR is what promotes content to production (via normal `main` CD). A daily cleanup job (**Maint: cleanup Studio branches**) deletes dated branches older than 28 days.

## Redeploy without code changes

GitHub → Actions → **CD: main** → **Run workflow** and select the **`main`** branch to run every CD stage regardless of path filters.

Manual dispatch from a non-`main` branch runs staging deploy and verification only (production stages are skipped). For branch testing without prod promotion, **CD: staging** is the dedicated path (equivalent staging-only outcome).

Alternatively, re-run all jobs on a previous `main` push workflow run.

## Rollback a bad content commit

```bash
git log --oneline -10
git revert <bad-commit-sha>
git push origin main
```

Or restore a previous file version and commit. Prefer `revert` over force-push. The revert still goes through staging → smoke → prod on `main`.

## Rollback application code

Same as above on the commit that broke the build/UI. Confirm **Deploy Staging**, **Smoke Staging**, **Deploy Production**, and **Smoke Production** are green before announcing recovery.

## Deploy Production / Smoke Production failure (Sev1)

When **Deploy Production** fails, CD emits `DeployFailed` to prod App Insights (`OPS-P3-003`). When **Smoke Production** fails after a successful deploy, CD emits `SmokeFailed` (`TEST-D-003`). Either event pages `ag-elyse-notify-prod` (email + SMS via `ALERT-*`; no voice). Staging deploy/smoke failures are **not** Sev1. There is **no** automatic rollback on smoke failure.

1. Open the failed Actions run; fix or revert ([incident-response.md](incident-response.md)).
2. Re-run CD from `main` (or merge a revert) so staging → smoke → prod → prod smoke succeeds.
3. Confirm homepage/materials synthetics and that the critical alert mitigated.

## Rollback infrastructure

Prefer a forward fix: revert the infra commit and merge so CD re-applies the previous configuration. Avoid `terraform destroy` against shared staging/prod unless you intend a full teardown.

## Deploy impact on the live site

SWA **static** files swap atomically. HTML revalidates after 30 seconds; hashed `/_astro/*` and `/images/_derived/*` get new URLs. Homepage and materials synthetics (Sev1) stay on those static URLs.

The **managed Functions API** is recycled on every upload because CD always passes `api_location: api`. Omitting `api_location` (or setting it to `""`) is Azure’s documented step for **unlinking** managed Functions — do not skip the API on markdown-only publishes.

During that recycle, in-flight `/api/*` calls can 5xx. That is expected and brief. CD emits `DeployStarted` immediately before upload and `DeployCompleted` after so those minutes do not consume the SLO-7 API error budget (`OPS-P6-001` / `OPS-P6-002`). Sev2 pages only when 3+ “bad” minutes (each with 2+ 5xx/timeouts) land in 2 days — a single recycle 502 does not page. A real homepage/materials outage still pages Sev1. A failed **Deploy Production** or **Smoke Production** still pages Sev1.

## Browser / CDN cache after a good deploy

SWA origin cache is cleared on deploy. HTML revalidates after **30 seconds**. Hashed `/_astro/*` and content-addressed `/images/_derived/*` use new URLs on each rebuild, so long cache on those files does not pin old pages. If a **stable** `/images/…` original looks stale, see [swa-caching.md](swa-caching.md) (diagnose → rename vs wait 7 days → purge only if enterprise-grade edge is on).
