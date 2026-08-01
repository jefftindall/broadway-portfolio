# Runbook: Deploy and rollback

## Promotion path (staging → production)

1. Open a PR targeting `main`. Actions runs **Deploy Staging** and updates the staging Static Web App.
2. Verify on staging (SWA default hostname from Terraform output `static_web_app_default_hostname` for staging).
3. Merge the PR. On `main`, Actions:
   - Deploys **staging** again (same commit)
   - Only if that succeeds, deploys **production**

Production never deploys unless staging succeeded for that run. Optional: add required reviewers on the GitHub Environment **prod** for a manual approval gate after staging.

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
