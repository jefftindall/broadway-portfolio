# Runbook: DNS and domain

## Validate custom domain

Terraform creates `azurerm_static_web_app_custom_domain` with `validation_type = dns-txt-token`.

1. `cd infra/environments/prod && terraform output -raw custom_domain_validation_token`
2. Create a TXT record as instructed by Azure (often `_dnsauth.elysetindall.com` or similar — follow Portal/SWA docs for the exact host)
3. Wait for validation to succeed

## Point apex traffic

Follow Azure Static Web Apps custom domain guidance for apex (`elysetindall.com`):

- Prefer ALIAS/ANAME if your DNS host supports it, or the A records Azure documents
- Add `www` if desired and configure redirect to apex

## Certificates

SWA manages free TLS certificates for validated custom domains. Renewal is automatic; if HTTPS fails after domain changes, re-check domain validation status in Portal.

## Cutover checklist

- [ ] SWA hostname serves the Astro site
- [ ] Custom domain validates
- [ ] HTTPS works on apex
- [ ] Old WordPress host no longer receives public DNS
- [ ] Email (`elyse.tindall@gmail.com`) unaffected (DNS MX untouched)
