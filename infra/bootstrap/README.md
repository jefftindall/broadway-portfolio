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
#   Region:            eastus2
#   Subscription:      e601e59a-c7f4-41f0-8178-b59740fb1974
#   Entra app:         elyse-portfolio-gha-terraform (OIDC for plan/apply)
#   Repo variables:    AZURE_TF_CLIENT_ID, AZURE_TF_TENANT_ID, AZURE_TF_SUBSCRIPTION_ID
#
# Also grant the Terraform SP Key Vault Secrets Officer (subscription) so Actions
# can refresh azurerm_key_vault_secret resources. Add repo secret TF_GITHUB_TOKEN
# (PAT with environment variable access) for the GitHub provider in CI.
#
# Staging/prod backends are preconfigured to use this account with distinct state keys.
# Re-apply after pulling OIDC changes so Actions can run Terraform.
