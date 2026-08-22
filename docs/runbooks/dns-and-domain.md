# Runbook: DNS and domain

Custom-domain validation and DNS mechanics for `elysetindall.com` (prod apex/www) and `test.elysetindall.com` (staging). For the full Namecheap EasyWP → Azure migration (redirects, cutover, search consoles, decommission), use [wordpress-to-azure-cutover.md](wordpress-to-azure-cutover.md).

## Validate custom domain

Terraform creates `azurerm_static_web_app_custom_domain` with `validation_type = dns-txt-token`.

1. `cd infra/environments/prod && terraform output -raw custom_domain_validation_token`
2. In Namecheap → Domain List → Manage → **Advanced DNS**, create a TXT record as instructed by Azure (often `_dnsauth.elysetindall.com` or host `@` — follow Portal/SWA docs for the exact host)
3. Wait for validation to succeed

## Point apex traffic

Follow Azure Static Web Apps custom domain guidance for apex (`elysetindall.com`):

- Prefer **ALIAS** to the SWA default hostname if Namecheap accepts it (keeps global distribution)
- Otherwise use the **A** record with `stableInboundIP` from SWA Overview → JSON View

See [wordpress-to-azure-cutover.md](wordpress-to-azure-cutover.md) §4 for the Namecheap HOST RECORDS table.

## www → apex

Preferred public host is the apex (`https://elysetindall.com`). Terraform binds both hostnames when `custom_domain` is set:

| Resource | Hostname | Validation |
|----------|----------|------------|
| `azurerm_static_web_app_custom_domain.apex` | `elysetindall.com` | `dns-txt-token` |
| `azurerm_static_web_app_custom_domain.www` | `www.elysetindall.com` | `cname-delegation` |

**DNS (Namecheap Advanced DNS)** — required before www validates:

| Type | Host | Value |
|------|------|-------|
| CNAME | `www` | `<swa-default-hostname>.azurestaticapps.net` |

**Redirect (Portal; not in Terraform):** after both custom domains show **Ready**:

1. Portal → Static Web App (prod) → **Custom domains**
2. Select `elysetindall.com` → **Set as default**
3. Confirm `https://www.elysetindall.com/` returns **301** to `https://elysetindall.com/` (path preserved)

Without “Set as default,” www serves the site with a valid cert but does not redirect — duplicate host for SEO. Entra callback URIs already include www when `custom_domain` is set.

## Staging: `test.elysetindall.com`

Do **not** set staging `custom_domain` to `test.elysetindall.com` — that variable is apex-only and would also try to bind `www.test.elysetindall.com`. Staging uses `custom_hostnames = ["test.elysetindall.com"]` (`dns-txt-token`) so Terraform apply does not wait on DNS.

**After staging Terraform apply:**

1. `cd infra/environments/staging && terraform output -json custom_hostname_validation_tokens` (sensitive map; copy the `test.elysetindall.com` value)
2. Staging SWA hostname: `terraform output -raw static_web_app_default_hostname`
3. Namecheap → Domain List → Manage → **Advanced DNS**:

| Type | Host | Value |
|------|------|-------|
| TXT | `_dnsauth.test` | `<validation token from step 1>` |
| CNAME | `test` | `ambitious-glacier-056054a0f.7.azurestaticapps.net` (confirm with `terraform output -raw static_web_app_default_hostname` if the SWA was ever recreated) |

4. Portal → Static Web App **staging** → **Custom domains** → wait until `test.elysetindall.com` is **Ready**
5. Select `test.elysetindall.com` → **Set as default** so `*.azurestaticapps.net` 301s there (same pattern as prod apex). Smoke already prefers a Ready custom domain via `scripts/resolve-swa-hostname.sh`.
6. Confirm `https://test.elysetindall.com/` serves the site with a valid cert
7. Cloudflare Turnstile widget: add hostname `test.elysetindall.com` ([rotate-secrets.md](rotate-secrets.md#turnstile))

**Crawlers:** Staging deploys patch `robots.txt` (`Disallow: /`) and `X-Robots-Tag: noindex, nofollow, noarchive` on the uploaded artifact only (`SEARCH-P2-008`). Production `public/robots.txt` is unchanged. Canonicals still point at `https://elysetindall.com`.

Entra redirect URIs include `https://test.elysetindall.com/.auth/login/aad/callback` automatically from `custom_hostnames`.

## Certificates

SWA manages free TLS certificates for validated custom domains. Renewal is automatic; if HTTPS fails after domain changes, re-check domain validation status in Portal.

A www CNAME that points at SWA **without** the www custom-domain binding causes a certificate name mismatch (Azure error page). Bind www (Terraform above) before relying on that hostname.

## Cutover checklist

Use the full checklist in [wordpress-to-azure-cutover.md](wordpress-to-azure-cutover.md). Minimum:

- [ ] SWA hostname serves the Astro site
- [ ] Custom domain validates
- [ ] HTTPS works on apex
- [ ] www is bound and redirects to apex (or at least serves with a valid cert)
- [ ] EasyWP no longer receives public DNS for apex
- [ ] Email (`elyse.tindall@gmail.com`) unaffected (DNS MX untouched)
