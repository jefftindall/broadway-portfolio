# Runbook: Rotate secrets

Secrets live in Azure Key Vault. SWA reads them via managed identity + Key Vault references.

| Environment | Key Vault | Resource group | Static Web App |
|---|---|---|---|
| Staging | `kv-elyse-staging` | `rg-elyse-portfolio-staging` | `swa-elyse-portfolio-staging` |
| Production | `kv-elyse-prod` | `rg-elyse-portfolio-prod` | `swa-elyse-portfolio-prod` |

Subscription: `e601e59a-c7f4-41f0-8178-b59740fb1974`

Azure’s platform cache for Key Vault references is about **24 hours**. For an immediate refresh without redeploying, use the copy/paste commands below, or run the **Refresh Key Vault references** workflow ([refresh-keyvault-refs.yml](../../.github/workflows/refresh-keyvault-refs.yml)) via **Actions → Run workflow**.

## Refresh SWA Key Vault references (no redeploy)

Re-applying the Key Vault reference app settings makes SWA resolve the latest secret versions without deploying site code.

### Staging (copy/paste)

```bash
az account set --subscription e601e59a-c7f4-41f0-8178-b59740fb1974
az staticwebapp appsettings set --name swa-elyse-portfolio-staging --resource-group rg-elyse-portfolio-staging --setting-names GEMINI_API_KEY="@Microsoft.KeyVault(SecretUri=https://kv-elyse-staging.vault.azure.net/secrets/GEMINI-API-KEY/)" GITHUB_APP_ID="@Microsoft.KeyVault(SecretUri=https://kv-elyse-staging.vault.azure.net/secrets/GITHUB-APP-ID/)" GITHUB_APP_INSTALLATION_ID="@Microsoft.KeyVault(SecretUri=https://kv-elyse-staging.vault.azure.net/secrets/GITHUB-APP-INSTALLATION-ID/)" GITHUB_APP_PRIVATE_KEY="@Microsoft.KeyVault(SecretUri=https://kv-elyse-staging.vault.azure.net/secrets/GITHUB-APP-PRIVATE-KEY/)" ALLOWED_USER_IDS="@Microsoft.KeyVault(SecretUri=https://kv-elyse-staging.vault.azure.net/secrets/ALLOWED-USER-IDS/)" AAD_CLIENT_SECRET="@Microsoft.KeyVault(SecretUri=https://kv-elyse-staging.vault.azure.net/secrets/AAD-CLIENT-SECRET/)"
```

### Production (copy/paste)

```bash
az account set --subscription e601e59a-c7f4-41f0-8178-b59740fb1974
az staticwebapp appsettings set --name swa-elyse-portfolio-prod --resource-group rg-elyse-portfolio-prod --setting-names GEMINI_API_KEY="@Microsoft.KeyVault(SecretUri=https://kv-elyse-prod.vault.azure.net/secrets/GEMINI-API-KEY/)" GITHUB_APP_ID="@Microsoft.KeyVault(SecretUri=https://kv-elyse-prod.vault.azure.net/secrets/GITHUB-APP-ID/)" GITHUB_APP_INSTALLATION_ID="@Microsoft.KeyVault(SecretUri=https://kv-elyse-prod.vault.azure.net/secrets/GITHUB-APP-INSTALLATION-ID/)" GITHUB_APP_PRIVATE_KEY="@Microsoft.KeyVault(SecretUri=https://kv-elyse-prod.vault.azure.net/secrets/GITHUB-APP-PRIVATE-KEY/)" ALLOWED_USER_IDS="@Microsoft.KeyVault(SecretUri=https://kv-elyse-prod.vault.azure.net/secrets/ALLOWED-USER-IDS/)" AAD_CLIENT_SECRET="@Microsoft.KeyVault(SecretUri=https://kv-elyse-prod.vault.azure.net/secrets/AAD-CLIENT-SECRET/)"
```

## Rotate Gemini API key

1. Create a new key in Google AI Studio
2. Update both vaults:

```bash
az keyvault secret set --vault-name kv-elyse-staging --name GEMINI-API-KEY --value "<new>"
az keyvault secret set --vault-name kv-elyse-prod --name GEMINI-API-KEY --value "<new>"
```

3. Run the staging and production refresh commands above (or run the Refresh Key Vault references workflow)
4. Revoke the old Gemini key
5. Publish a harmless Studio update to verify

## Rotate the GitHub App private key

1. GitHub App settings → **Private keys → Generate a private key**
2. Upload to both Key Vaults:

```bash
az keyvault secret set --vault-name kv-elyse-staging --name GITHUB-APP-PRIVATE-KEY --file ./new-key.pem
az keyvault secret set --vault-name kv-elyse-prod --name GITHUB-APP-PRIVATE-KEY --file ./new-key.pem
```

3. Run the staging and production refresh commands above (or run the Refresh Key Vault references workflow)
4. Delete the previous private key in the GitHub App UI
5. Delete the local `.pem`
6. Verify Studio can still commit

App ID and installation ID rarely change; only update those Key Vault secrets if you recreate the App or reinstall it.

## Rotate the Entra client secret (Studio login)

The secret is created by Terraform (`azuread_application_password`) and written to Key Vault as `AAD-CLIENT-SECRET`.

Rotation is automatic: a `time_rotating` resource triggers a replacement secret every `entra_secret_rotation_days` (default 300), while each secret stays valid for `entra_secret_lifetime` (default one year). Because rotation happens before expiry, a routine `terraform apply` picks up the new secret with no outage.

To force rotation early:

```bash
cd infra/environments/<env>
terraform apply -replace='module.portfolio.azuread_application_password.swa'
```

Either path issues a new secret, updates Key Vault, and leaves the SWA app setting reference intact. Confirm sign-in at `/studio` afterward.

## GitHub Actions deploy credentials

There is **no long-lived SWA deploy token** in GitHub secrets. Actions use OIDC (`azure/login`) and fetch the SWA API key at job runtime via `az staticwebapp secrets list`.

To rotate Entra trust for Actions, re-apply Terraform (federated credentials are declarative). Resetting the SWA deployment token in the Azure Portal is optional; the next workflow run picks up the current key automatically.

## Rules

- Never put secrets in git, Terraform `tfvars`, or chat logs
- Prefer GitHub App private keys and OIDC over PATs
- Delete downloaded `.pem` files after uploading to Key Vault
