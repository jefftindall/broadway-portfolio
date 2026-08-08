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
6. Where can this App be installed? **Only on this account**
7. Create the App, then **Generate a private key** (download the `.pem`)
8. Note the **App ID** on the App settings page

If the App already exists without Actions read: App settings → **Permissions & events** → set **Actions** to **Read-only** → Save → accept the new permission on the installation.

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

Studio writes via the Contents API (not PRs). The monthly ops scorecard workflow checks out with `persist-credentials: false`, mints an installation token via [`scripts/mint-github-app-token.sh`](../../scripts/mint-github-app-token.sh) (PEM never logged), configures git `http.extraheader` with that token, and pushes to `main` as `elyse-portfolio-studio[bot]`. The **Protect main** ruleset must list the App as a bypass actor, or publishes / scorecard commits fail with “Cannot update this protected ref.”

1. Repo → **Settings → Rules → Rulesets → Protect main**
2. **Bypass list** → **Add bypass** → choose the Studio GitHub App (`elyse-portfolio-studio`) → bypass mode **Always**
3. Save

The App’s numeric ID (Key Vault `GITHUB-APP-ID`) is the Integration `actor_id` on the ruleset. Keep any existing User bypasses when editing.

## Verify

Publish a harmless Studio update and confirm a commit authored by the GitHub App appears on `main`.
