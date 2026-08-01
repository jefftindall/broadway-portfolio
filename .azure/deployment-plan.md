# Azure Deployment Plan — Elyse Tindall Portfolio

> Approved via Cursor plan (broadway_portfolio_astro_build). Executing after user confirmation.

## Summary

| Item | Decision |
|------|----------|
| App type | Astro SSG portfolio + Azure SWA managed Functions API |
| Hosting | Azure Static Web Apps (Standard) |
| IaC | Terraform (`infra/terraform/`) |
| Secrets | Azure Key Vault (source of truth); API secrets synced into SWA app settings; AAD secret via Key Vault reference |
| Auth | Entra ID / Google via SWA; Elyse-only allowlist for `/studio` + `/api/*` |
| Domain | elysetindall.com custom domain on SWA |
| CI/CD | GitHub Actions → SWA |

## Resources

1. Bootstrap (once): `rg-elyse-tfstate` + `stelysetfstateeu2` / `tfstate` container in **East US 2**
2. Per environment (`staging` / `prod`): resource group, Static Web App (Standard) with system-assigned managed identity, Key Vault (RBAC), role assignments, resolved API app settings from Key Vault (+ AAD Key Vault reference)
3. Prod only: custom domain binding (`elysetindall.com`)
4. Names are environment-scoped (e.g. `rg-elyse-portfolio-staging`, `kv-elyse-prod`) to avoid collisions

All resources are in **East US 2**.

## Phases

- [x] Phase 0: Plan approved by user
- [x] Phase 1: Scaffold Astro + content + public UI
- [x] Phase 2: Studio UI + API Functions + auth config
- [x] Phase 3: Terraform + docs + GitHub Actions workflow
- [ ] Phase 4: Provisioning / DNS cutover (manual; documented in docs/setup.md)

## Out of scope for this prepare pass

- Running `terraform apply` or DNS cutover (requires Azure subscription credentials; documented in runbooks)
- Self-hosted video streaming
