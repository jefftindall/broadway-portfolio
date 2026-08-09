# Runbook: GA4 Data API access (scorecard visits / top pages)

**Action ID:** `OPS-P5-002`  
**Audience:** Operators setting up monthly scorecard automation  
**Vault:** `kv-elyse-shared` (bootstrap placeholders; real values via CLI only)

Browser GA4 collection uses the **public** Measurement ID (`G-XEE29C0RRE` → `PUBLIC_GA_MEASUREMENT_ID`). That is enough for `gtag` — **not** enough for the monthly job to read reports.

Automating **visits** and **top pages** into the ops scorecard needs the [Google Analytics Data API](https://developers.google.com/analytics/devguides/reporting/data/v1) plus a service account with **Viewer** on the GA4 property. Contact and Studio-update counts use App Insights instead ([operational-excellence.md](../plans/operational-excellence.md) § Site performance) and do **not** need this setup.

**Never** commit the service-account JSON, print it to logs/chat/PRs, or pass it through a GitHub Action `with:` input. Prefer `--file` into Key Vault; mask line-by-line in Actions.

---

## Prerequisites

- Bootstrap Terraform applied so `GA-PROPERTY-ID` and `GA-DATA-API-SA-JSON` exist as `REPLACE_ME` in `kv-elyse-shared` ([shared_kv.tf](../../infra/bootstrap/shared_kv.tf)).
- Google account that administers the GA4 property for `elysetindall.com`.
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud`) and Azure CLI (`az`) logged in with permission to write shared vault secrets.
- Azure: Key Vault Secrets Officer (or set) on `kv-elyse-shared`.

---

## 1. Confirm the numeric Property ID

1. Open [Google Analytics](https://analytics.google.com/) → Admin for the `elysetindall.com` property (Measurement ID `G-XEE29C0RRE`).
2. **Admin → Property settings → Property ID** — copy the **numeric** ID.
3. Data API resource name is `properties/{NUMERIC_ID}` — **not** `G-…`.

---

## 2. GCP project + enable the Data API

Use an existing small GCP project owned by the same Google account, or create one:

```bash
# Optional — create a dedicated project
gcloud projects create elyse-portfolio-ops --name="Elyse portfolio ops"

export GCP_PROJECT_ID="elyse-portfolio-ops"   # or your existing project id
gcloud config set project "$GCP_PROJECT_ID"
gcloud services enable analyticsdata.googleapis.com --project="$GCP_PROJECT_ID"
```

---

## 3. Create a service account + JSON key

No broad GCP IAM roles are required for Data API reads; access is granted **inside GA4** (next step).

```bash
export SA_NAME="elyse-scorecard-ga"
export SA_EMAIL="${SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "$SA_NAME" \
  --display-name="Elyse scorecard GA4 Data API" \
  --project="$GCP_PROJECT_ID"

# Write key to a local file only — never cat / type the JSON into a shell history-friendly --value
gcloud iam service-accounts keys create ./ga-scorecard-sa.json \
  --iam-account="$SA_EMAIL" \
  --project="$GCP_PROJECT_ID"

chmod 600 ./ga-scorecard-sa.json
```

Remember `$SA_EMAIL` for the GA Admin grant.

---

## 4. Grant GA4 Viewer (console)

`gcloud` does not replace this property-ACL step reliably for personal GA properties.

1. GA4 **Admin → Property access management** → **Add users**.
2. Paste the service-account email (`elyse-scorecard-ga@PROJECT.iam.gserviceaccount.com`).
3. Role: **Viewer** (read reports only — do **not** grant Editor/Admin).
4. Save.

---

## 5. Store secrets in Azure Key Vault

After bootstrap apply (secrets exist as `REPLACE_ME`):

```bash
# Numeric property ID only (not G-…)
az keyvault secret set \
  --vault-name kv-elyse-shared \
  --name GA-PROPERTY-ID \
  --value "<numeric-property-id>"

# Full service-account JSON — use --file so the value is not echoed on the command line
az keyvault secret set \
  --vault-name kv-elyse-shared \
  --name GA-DATA-API-SA-JSON \
  --file ./ga-scorecard-sa.json
```

Delete the local key file immediately:

```bash
# Windows (PowerShell): Remove-Item -Force .\ga-scorecard-sa.json
rm -f ./ga-scorecard-sa.json
```

These secrets are **not** synced into SWA and are **not** required for CD Build. The monthly scorecard workflow loads them for `ops-scorecard-refresh.mjs` only.

### Verify presence (no value dump)

```bash
az keyvault secret show --vault-name kv-elyse-shared --name GA-PROPERTY-ID --query name -o tsv
az keyvault secret show --vault-name kv-elyse-shared --name GA-DATA-API-SA-JSON --query name -o tsv
# Optional: confirm not still REPLACE_ME without printing the JSON body
az keyvault secret show --vault-name kv-elyse-shared --name GA-PROPERTY-ID --query "value != 'REPLACE_ME'" -o tsv
```

Do **not** run `az keyvault secret show ... --query value` for `GA-DATA-API-SA-JSON` in shared terminals or CI logs.

---

## 6. Local / CI prove-out

With Azure login and secrets set:

```bash
# Local: source so GA_PROPERTY_ID / GA_DATA_API_SA_JSON_FILE reach the Node process
export AZURE_SHARED_KEY_VAULT_NAME=kv-elyse-shared
source scripts/fetch-ga-scorecard-secrets.sh
node scripts/ops-scorecard-refresh.mjs --monthly --azure
# optional: rm -f "$GA_DATA_API_SA_JSON_FILE"
```

**Windows notes**

- Put Azure CLI on `PATH` (or use Git Bash with `/c/Program Files/Microsoft SDKs/Azure/CLI2/wbin`).
- The refresh script invokes Azure CLI via the Windows Python entrypoint (`python.exe -IBm azure.cli`) so Node does not need to spawn `az.cmd`.
- First-time App Insights queries may need: `az extension add --name application-insights --yes`.
- Cost Management can return **429** if you re-run probes quickly; App Insights / GA rows can still succeed. Re-try spend later or keep the prior successful `costProbe`.

Confirm `docs/ops/scorecard-evaluation.json` gains a `sitePerformance` block with visits/top pages when GA auth works (contacts/updates fill from App Insights even if GA is still `REPLACE_ME`). Soft-fail leaves GA rows stale and must **not** print the SA JSON.

---

## 7. Rotate the service-account key

Rotate immediately if the JSON ever appears in Actions logs, chat, or git.

1. Create a new key (or a new SA + re-grant Viewer):

```bash
gcloud iam service-accounts keys create ./ga-scorecard-sa-new.json \
  --iam-account="$SA_EMAIL" \
  --project="$GCP_PROJECT_ID"
chmod 600 ./ga-scorecard-sa-new.json
```

2. Update Key Vault:

```bash
az keyvault secret set \
  --vault-name kv-elyse-shared \
  --name GA-DATA-API-SA-JSON \
  --file ./ga-scorecard-sa-new.json
rm -f ./ga-scorecard-sa-new.json
```

3. In Google Cloud Console → IAM → Service Accounts → Keys, **delete** the old key id.
4. Re-run a scorecard refresh (workflow_dispatch or local `--monthly --azure`) to confirm visits/top pages still populate.

Property ID rarely changes; only update `GA-PROPERTY-ID` if you recreate the GA4 property.

---

## Related

| Doc | Role |
|-----|------|
| [rotate-secrets.md](rotate-secrets.md) | Shared vault SoT; points here for GA Data API |
| [operational-excellence.md](../plans/operational-excellence.md) | `OPS-P5-*` contract + privacy rules |
| [search-and-analytics.md](../plans/search-and-analytics.md) | Public Measurement ID + Phase 3 manual GSC/GA loop (not replaced by this) |
| [observability.md](observability.md) | App Insights vs GA4 roles |
