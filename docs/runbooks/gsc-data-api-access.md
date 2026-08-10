# Runbook: GSC Search Analytics API access (monthly search signals)

**Action ID:** `SEARCH-P4-001`  
**Audience:** Operators setting up monthly search-ops automation (`SEARCH-P4-002`)  
**Vault:** `kv-elyse-shared` (bootstrap placeholders; real values via CLI only)

Browser Search Console is enough for manual reviews — **not** enough for the monthly job to read reports. Automating **queries / CTR / page impressions** needs the [Search Console API](https://developers.google.com/webmaster-tools/v1/api_reference_index) (Search Analytics) plus a service account added as a user on the GSC property.

**Prefer reusing** the GA4 scorecard service account from [ga-data-api-access.md](ga-data-api-access.md) (`OPS-P5-002`): enable `searchconsole.googleapis.com` on the same GCP project, grant the SA on the GSC property, and leave `GSC-DATA-API-SA-JSON` as `REPLACE_ME` so `scripts/fetch-gsc-search-secrets.sh` falls back to `GA-DATA-API-SA-JSON`.

**Never** commit the service-account JSON, print it to logs/chat/PRs, or pass it through a GitHub Action `with:` input. Prefer `--file` into Key Vault; mask line-by-line in Actions.

---

## Prerequisites

- Bootstrap Terraform applied so `GSC-SITE-URL` and `GSC-DATA-API-SA-JSON` exist as `REPLACE_ME` in `kv-elyse-shared` ([shared_kv.tf](../../infra/bootstrap/shared_kv.tf)).
- GSC property for `elysetindall.com` verified (`SEARCH-P0-002` / `DISC-P0-002`).
- Google account that administers that property.
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud`) and Azure CLI (`az`) logged in with permission to write shared vault secrets.
- Azure: Key Vault Secrets Officer (or set) on `kv-elyse-shared`.

---

## 1. Confirm the GSC site URL

Use the same resource name Search Console APIs expect:

| Property type | `GSC-SITE-URL` value |
|---------------|----------------------|
| Domain property | `sc-domain:elysetindall.com` |
| URL-prefix (apex) | `https://elysetindall.com/` |

Check in [Search Console](https://search.google.com/search-console) → property settings. Prefer the **domain** property when both exist.

---

## 2. Enable the Search Console API

Reuse the scorecard GCP project when possible:

```bash
export GCP_PROJECT_ID="elyse-portfolio-ops"   # or your existing project id
gcloud config set project "$GCP_PROJECT_ID"
gcloud services enable searchconsole.googleapis.com --project="$GCP_PROJECT_ID"
```

---

## 3. Service account (reuse GA SA or create)

### Reuse (preferred)

If `elyse-scorecard-ga@PROJECT.iam.gserviceaccount.com` already exists for GA Data API:

1. Note `$SA_EMAIL` from [ga-data-api-access.md](ga-data-api-access.md).
2. Skip creating a new key — the monthly search workflow falls back to `GA-DATA-API-SA-JSON`.
3. Still grant GSC access (next step).

### New SA (only if not reusing)

```bash
export SA_NAME="elyse-search-gsc"
export SA_EMAIL="${SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "$SA_NAME" \
  --display-name="Elyse search-ops GSC API" \
  --project="$GCP_PROJECT_ID"

gcloud iam service-accounts keys create ./gsc-search-sa.json \
  --iam-account="$SA_EMAIL" \
  --project="$GCP_PROJECT_ID"

chmod 600 ./gsc-search-sa.json
```

---

## 4. Grant Search Console user (console)

`gcloud` does not replace this property-ACL step.

1. Open [Search Console](https://search.google.com/search-console) → the `elysetindall.com` property → **Settings → Users and permissions**.
2. **Add user** → paste the service-account email.
3. Permission: **Full** (or the minimum that can read Search Analytics + sitemaps — Full is simplest for a read-only automation SA).
4. Save / accept any verification prompts.

---

## 5. Store secrets in Azure Key Vault

After bootstrap apply (secrets exist as `REPLACE_ME`):

```bash
# Exact GSC resource string (see §1)
az keyvault secret set \
  --vault-name kv-elyse-shared \
  --name GSC-SITE-URL \
  --value "sc-domain:elysetindall.com"

# Only when NOT reusing GA-DATA-API-SA-JSON:
az keyvault secret set \
  --vault-name kv-elyse-shared \
  --name GSC-DATA-API-SA-JSON \
  --file ./gsc-search-sa.json
rm -f ./gsc-search-sa.json
```

When reusing the GA SA, leave `GSC-DATA-API-SA-JSON` as `REPLACE_ME`.

### Verify presence (no value dump)

```bash
az keyvault secret show --vault-name kv-elyse-shared --name GSC-SITE-URL --query name -o tsv
az keyvault secret show --vault-name kv-elyse-shared --name GSC-SITE-URL --query "value != 'REPLACE_ME'" -o tsv
# Optional dedicated SA:
az keyvault secret show --vault-name kv-elyse-shared --name GSC-DATA-API-SA-JSON --query name -o tsv
```

Do **not** run `az keyvault secret show ... --query value` for `*-SA-JSON` in shared terminals or CI logs.

---

## 6. Local / CI prove-out

With Azure login and secrets set:

```bash
export AZURE_SHARED_KEY_VAULT_NAME=kv-elyse-shared
source scripts/fetch-ga-scorecard-secrets.sh
source scripts/fetch-gsc-search-secrets.sh
node scripts/search-ops-signals-refresh.mjs
# optional: rm -f "$GSC_DATA_API_SA_JSON_FILE" "$GA_DATA_API_SA_JSON_FILE"
```

**Dry-run without live APIs** (prints counts/themes only — never full query tables):

```bash
node scripts/search-ops-signals-refresh.mjs \
  --fixture=scripts/fixtures/search-signals-sample.json \
  --out-dir=/tmp/search-signals-dry
```

Confirm `docs/ops/search-signals/YYYY-MM.json` (or the dry-run out-dir) has `coverage` rows 1–5 and that job logs show theme ids / counts only. Soft-fail leaves GSC/GA sections `stale` and must **not** print SA JSON.

Monthly workflow: `.github/workflows/search-ops-monthly.yml` (`SEARCH-P4-002`).

---

## 7. Rotate the service-account key

Rotate immediately if the JSON ever appears in Actions logs, chat, or git.

- If reusing the GA SA: follow [ga-data-api-access.md](ga-data-api-access.md) § Rotate (updates `GA-DATA-API-SA-JSON`).
- If using a dedicated GSC key: create a new key, `az keyvault secret set --name GSC-DATA-API-SA-JSON --file …`, delete the old GCP key, re-run **SEARCH monthly signals**.

---

## Related

| Doc | Role |
|-----|------|
| [rotate-secrets.md](rotate-secrets.md) | Shared vault SoT; GSC secret names |
| [ga-data-api-access.md](ga-data-api-access.md) | Prefer reuse of GA scorecard SA |
| [search-ops-monthly.md](search-ops-monthly.md) | Manual checklist superseded by `SEARCH-P4-002` artifact |
| [search-and-analytics.md](../plans/search-and-analytics.md) | `SEARCH-P4-001` / `002` backlog |
| [docs/ops/search-signals/README.md](../ops/search-signals/README.md) | Artifact schema for `DISC-P4-003` |
