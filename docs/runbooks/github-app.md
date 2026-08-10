# Runbook: Create the Studio GitHub App

GitHub does not allow Terraform to create Apps. Create one App and install it on this repo; Terraform stores the credentials in Key Vault and the Studio API mints short-lived installation tokens.

## Create the App

1. GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**
2. Suggested name: `elyse-portfolio-studio`
3. Homepage URL: `https://elysetindall.com`
4. Webhook: disable (uncheck Active)
5. Repository permissions:
   - **Contents**: Read and write
   - **Metadata**: Read-only
   - **Actions**: Read-only (Studio polls deploy progress after publish)
   - **Pull requests**: Read and write (staging Studio opens/updates `staging-studio-YYYYMMDD` PRs into `main`)
6. Where can this App be installed? **Only on this account**
7. Create the App, then **Generate a private key** (download the `.pem`)
8. Note the **App ID** on the App settings page

If the App already exists without Actions read or Pull requests write: App settings → **Permissions & events** → set **Actions** to **Read-only** and **Pull requests** to **Read and write** → Save → accept the new permission on the installation.

## Install on the repo

1. App settings → **Install App** → install on `jefftindall/broadway-portfolio` only
2. After install, the URL looks like `https://github.com/settings/installations/<installation_id>` — copy that **installation ID**

## Store in Key Vault

Vaults: **`kv-elyse-staging`** and **`kv-elyse-prod`**.

```bash
# PEM as a single string with literal \n is fine; Key Vault stores multiline too.
az keyvault secret set --vault-name kv-elyse-staging --name GITHUB-APP-ID --value "<app-id>"
az keyvault secret set --vault-name kv-elyse-staging --name GITHUB-APP-INSTALLATION-ID --value "<installation-id>"
az keyvault secret set --vault-name kv-elyse-staging --name GITHUB-APP-PRIVATE-KEY --file ./elyse-portfolio-studio.pem

az keyvault secret set --vault-name kv-elyse-prod --name GITHUB-APP-ID --value "<app-id>"
az keyvault secret set --vault-name kv-elyse-prod --name GITHUB-APP-INSTALLATION-ID --value "<installation-id>"
az keyvault secret set --vault-name kv-elyse-prod --name GITHUB-APP-PRIVATE-KEY --file ./elyse-portfolio-studio.pem
```

Reuse the same App for staging and prod (one installation covers the repo). Delete the local `.pem` after upload.

## Allow direct commits to `main`

**Production** Studio (`STUDIO_PUBLISH_MODE=direct`) writes via the Git Data API (blobs → tree → commit → ref update) to `GITHUB_BRANCH` (usually `main`). **Staging** Studio (`STUDIO_PUBLISH_MODE=pr`) commits to a dated `staging-studio-YYYYMMDD` branch and opens/updates a PR into `main` — that path does not need Protect-main bypass for the publish itself (only a human merge promotes to prod).

Each Studio publish (including gallery photo + markdown) lands as **one commit** with all files, so CD runs once. Transient GitHub/network errors and branch tip races are retried inside the API before the publish fails to the UI.

The monthly ops scorecard workflow (and search-ops monthly) checks out with `persist-credentials: false`, mints an installation token via [`scripts/mint-github-app-token.sh`](../../scripts/mint-github-app-token.sh) (PEM never logged), configures git `http.extraheader` with that token, and pushes to `main` as `elyse-portfolio-studio[bot]`. Before push, [`scripts/git-push-main-rebase.sh`](../../scripts/git-push-main-rebase.sh) fetches `origin/main`, rebases with `--autostash` (so incidental working-tree dirt such as `chmod +x` mode flips cannot block the rebase), and retries on tip races (no force-push) — the Azure/GSC/GA probe windows often outlast concurrent merges. Keep workflow shell scripts executable in git (`100755`) so Actions `chmod +x` is a no-op. The **Protect main** ruleset must list the App as a bypass actor, or prod Studio publishes / scorecard commits fail with “Cannot update this protected ref.”

1. Repo → **Settings → Rules → Rulesets → Protect main**
2. **Bypass list** → **Add bypass** → choose the Studio GitHub App (`elyse-portfolio-studio`) → bypass mode **Always**
3. Save

The App’s numeric ID (Key Vault `GITHUB-APP-ID`) is the Integration `actor_id` on the ruleset. Keep any existing User bypasses when editing.

## Staging Studio publish (PR mode)

Staging SWA sets `STUDIO_PUBLISH_MODE=pr` (Terraform). Each UTC day reuses one branch `staging-studio-YYYYMMDD`:

1. Publish from staging `/studio` → commits land on that branch (and merge latest `main` in so prod updates flow into staging).
2. The App opens or updates a PR into `main`.
3. Test: Actions → **CD: staging** → run on that branch (staging SWA only; no prod).
4. Promote: merge the PR → normal CD (`main` → staging verify → prod).
5. Daily workflow **Maint: cleanup Studio branches** deletes `staging-studio-*` branches older than **28 days** (UTC).

Local API: set `STUDIO_PUBLISH_MODE=pr` in `api/local.settings.json` to exercise the same path.

## Verify

- **Prod:** Publish a harmless Studio update and confirm a commit authored by the GitHub App appears on `main`.
- **Staging:** Publish from the staging hostname and confirm a `staging-studio-YYYYMMDD` branch + open PR (not a direct `main` commit).

### Local mint dry-run (no push)

Before re-running **Ops: monthly scorecard** after App key or mint-script changes:

```bash
# Git Bash / macOS / Linux; az login with Key Vault Secrets User on the vault
export AZURE_KEY_VAULT_NAME=kv-elyse-prod
npm run test:github-app-token
# or: ./scripts/test-github-app-token.sh --vault kv-elyse-prod
```

This mints an installation token via `scripts/mint-github-app-token.sh`, checks Contents:write + repo access, and `git ls-remote` with App auth — **never prints** the PEM or token. Fix failures locally before another Actions run.
