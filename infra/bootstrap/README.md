# Bootstrap Terraform remote state (run once, local state).
#
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
#
# Staging/prod backends are preconfigured to use this account with distinct state keys.
