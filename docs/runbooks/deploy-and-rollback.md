# Runbook: Deploy and rollback

## Promotion path (staging → production)

1. Open a PR targeting `main`. Actions:
   - Runs **Static analysis** (Terraform fmt/TFLint/validate, Astro check, API syntax)
   - Deploys the app to **staging** (Static Web App)
   - If the PR touches `infra/`, also runs **Terraform CI** (`terraform plan` for staging and prod) and comments the plan on the PR
2. Verify on staging (SWA default hostname from Terraform output `static_web_app_default_hostname` for staging).
3. Merge the PR. On `main`, Actions:
   - If `infra/` changed: **Terraform apply staging**, then **Deploy Staging**, then **Terraform apply prod**, then **Deploy Production**
   - If `infra/` did not change: **Deploy Staging**, then **Deploy Production** (Terraform apply jobs are skipped)

Production never deploys unless staging succeeded for that run. Optional: add required reviewers on the GitHub Environment **prod** for a manual approval gate after staging.

## Test a branch in staging (manual)

Use this to try infra and/or app changes from any branch without merging:

1. GitHub → Actions → **Staging branch**
2. **Run workflow** → select the branch → Run
3. The workflow applies staging Terraform from that branch, then builds and deploys the staging Static Web App

## Redeploy without code changes

GitHub → Actions → **Azure Static Web Apps CI/CD** → Re-run jobs.

## Rollback a bad content commit

```bash
git log --oneline -10
git revert <bad-commit-sha>
git push origin main
```

Or restore a previous file version and commit. Prefer `revert` over force-push. The revert still goes through staging → prod.

## Rollback application code

Same as above on the commit that broke the build/UI. Confirm both **Deploy Staging** and **Deploy Production** are green before announcing recovery.

## Rollback infrastructure

Prefer a forward fix: revert the infra commit and merge so CD re-applies the previous configuration. Avoid `terraform destroy` against shared staging/prod unless you intend a full teardown.
