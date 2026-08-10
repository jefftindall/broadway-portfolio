# Bootstrap Terraform remote state + Terraform OIDC (run once, local state).
#
#   export GH_TOKEN="$(gh auth token)"   # needs admin access to repo variables
#   cd infra/bootstrap
#   terraform init -input=false
#   terraform plan -input=false -out=tfplan
#   terraform apply tfplan
#
# Creates:
#   Resource group:    rg-elyse-tfstate
#   Storage account:   stelysetfstateeu2
#   Container:         tfstate
#   Shared RG/vault:   rg-elyse-shared / kv-elyse-shared (SITE-*, Turnstile, ACS, ALERT-*, GA-*, GSC-*)
#   Shared ACS:        acs-elyse-shared + email-elyse-shared (one MailFrom / SMS number)
#   Subscription budget: budget-elyse-portfolio-monthly (ceil(expected×1.25), currently $34/mo; ALERT-EMAIL at 80%/100%)
#   Region:            eastus2
#   Subscription:      e601e59a-c7f4-41f0-8178-b59740fb1974
#   Entra app:         elyse-portfolio-gha-terraform (OIDC for plan/apply)
#   Repo variables:    AZURE_TF_CLIENT_ID, AZURE_TF_TENANT_ID, AZURE_TF_SUBSCRIPTION_ID,
#                      AZURE_SHARED_KEY_VAULT_NAME
#
# Also grant the Terraform SP Key Vault Secrets Officer (subscription) so Actions
# can refresh azurerm_key_vault_secret resources. Add repo secret TF_GITHUB_TOKEN
# (PAT with environment variable access) for the GitHub provider in CI.
#
# Staging/prod backends are preconfigured to use this account with distinct state keys.
# Re-apply after pulling OIDC / shared vault / budget changes so Actions can run Terraform.
# Populate shared vault secrets per docs/runbooks/rotate-secrets.md before CD builds.
# Set ALERT-EMAIL before expecting budget threshold emails (otherwise Owners are notified).
# GA-PROPERTY-ID / GA-DATA-API-SA-JSON: see docs/runbooks/ga-data-api-access.md (OPS-P5 scorecard).
# GSC-SITE-URL defaults to https://elysetindall.com/; GSC-DATA-API-SA-JSON falls back to GA SA:
#   docs/runbooks/gsc-data-api-access.md (SEARCH-P4 search signals).
