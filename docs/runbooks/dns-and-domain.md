# Runbook: DNS and domain

Custom-domain validation and apex DNS mechanics for `elysetindall.com`. For the full Namecheap EasyWP → Azure migration (redirects, cutover, search consoles, decommission), use [wordpress-to-azure-cutover.md](wordpress-to-azure-cutover.md).

## Validate custom domain

Terraform creates `azurerm_static_web_app_custom_domain` with `validation_type = dns-txt-token`.

1. `cd infra/environments/prod && terraform output -raw custom_domain_validation_token`
2. In Namecheap → Domain List → Manage → **Advanced DNS**, create a TXT record as instructed by Azure (often `_dnsauth.elysetindall.com` or host `@` — follow Portal/SWA docs for the exact host)
3. Wait for validation to succeed

## Point apex traffic

Follow Azure Static Web Apps custom domain guidance for apex (`elysetindall.com`):

- Prefer **ALIAS** to the SWA default hostname if Namecheap accepts it (keeps global distribution)
- Otherwise use the **A** record with `stableInboundIP` from SWA Overview → JSON View
- Add `www` as a CNAME to the SWA hostname and bind it in Portal; optionally redirect www → apex

See [wordpress-to-azure-cutover.md](wordpress-to-azure-cutover.md) §4 for the Namecheap HOST RECORDS table.

## Certificates

SWA manages free TLS certificates for validated custom domains. Renewal is automatic; if HTTPS fails after domain changes, re-check domain validation status in Portal.

## Cutover checklist

Use the full checklist in [wordpress-to-azure-cutover.md](wordpress-to-azure-cutover.md). Minimum:

- [ ] SWA hostname serves the Astro site
- [ ] Custom domain validates
- [ ] HTTPS works on apex
- [ ] EasyWP no longer receives public DNS for apex
- [ ] Email (`elyse.tindall@gmail.com`) unaffected (DNS MX untouched)
