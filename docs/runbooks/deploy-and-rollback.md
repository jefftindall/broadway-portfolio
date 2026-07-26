# Runbook: Deploy and rollback

## Normal deploy

Push to `main` (or merge a PR). GitHub Actions builds Astro and deploys to Azure Static Web Apps.

Studio publishes also commit to `main`, which triggers the same pipeline. Target: live within ~5 minutes.

## Redeploy without code changes

GitHub → Actions → **Azure Static Web Apps CI/CD** → Re-run job.

## Rollback a bad content commit

```bash
git log --oneline -10
git revert <bad-commit-sha>
git push origin main
```

Or restore a previous file version and commit. Prefer `revert` over force-push.

## Rollback application code

Same as above on the commit that broke the build/UI. Confirm Actions is green before announcing recovery.

## Staging via pull request

Opened PRs get a SWA staging environment (when using the provided workflow). Review there before merging to `main`.
