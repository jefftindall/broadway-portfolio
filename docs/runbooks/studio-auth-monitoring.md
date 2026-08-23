# Runbook: Studio auth monitoring (TEST-C-005)

Post-deploy checks that Studio’s Entra login still works. They run in **Smoke Staging** and **Smoke Production** after each CD deploy. This is **not** publisher E2E (no compose, no Gemini) and does **not** use ROPC.

Living “what runs today”: [testing-strategy.md](testing-strategy.md). TOTP capture below is the operator-only step Terraform cannot do.

## What CD runs

| Step | When | Skip / fail |
|------|------|-------------|
| `client_credentials` (`npm run test:studio-auth-token`) | After deploy, every smoke job | Fails the job if the SWA app secret or `Monitor.Ping` role is broken |
| Playwright `tests/smoke/studio-auth.spec.ts` | Same jobs, desktop only | **Skips** while `MONITOR-TOTP-SEED` is `REPLACE_ME`; **fails** the job once the seed is set and login/health breaks |
| Public smoke (`tests/smoke/staging.spec.ts`) | Always | Independent of monitor secrets |

Assertion target: [`/studio/health`](../../src/pages/studio/health.astro) (`data-studio-health="ok"` / text `studio-health-ok`). The monitor account must **not** be on `ALLOWED-USER-IDS`.

Credentials are **shared** across staging and prod: one Entra user, secrets in `kv-elyse-shared`. Each env stack assigns that user to its SWA enterprise app (`elyse-portfolio-staging` / `elyse-portfolio-prod`).

## Bootstrap the monitor user

1. Apply **bootstrap** Terraform locally (needs **User Administrator** or Global Administrator — do not grant that to the GitHub Terraform SP unless bootstrap starts running from Actions):

```bash
cd infra/bootstrap
terraform init -input=false
terraform plan -input=false -out=tfplan
terraform apply tfplan
```

That creates `azuread_user` `studio-monitor@<initial tenant domain>` (override with `-var='monitor_upn=...'` on **bootstrap and both env stacks**), writes `MONITOR-UPN` and `MONITOR-PASSWORD` to `kv-elyse-shared`, and leaves `MONITOR-TOTP-SEED` as `REPLACE_ME`.

2. Apply **staging** and **prod** so `azuread_app_role_assignment` attaches the user to both SWA apps. Until the user exists, env apply still succeeds (assignment `count = 0`).

3. Enroll software TOTP and set the seed (next section). Re-run CD or wait for the next deploy; auth Playwright should run, not skip.

Password is Terraform-managed (also in bootstrap state, same class as `AAD-CLIENT-SECRET`). The TOTP seed is **never** in Terraform.

## Capture the TOTP seed (once)

Playwright cannot complete **push / number-match** Microsoft Authenticator. It needs a **software TOTP** Base32 secret (`otpauth://totp/...?secret=...`). Security Defaults forces MFA registration on **first sign-in** of the new user — that is the only window Entra shows the secret. After enrollment, Graph `softwareOathAuthenticationMethod.secretKey` is always null; you cannot retrieve it later.

### Steps

1. After bootstrap apply, confirm the secrets exist (do **not** print values into chat, tickets, or git):

```bash
az keyvault secret show --vault-name kv-elyse-shared --name MONITOR-UPN --query name -o tsv
az keyvault secret show --vault-name kv-elyse-shared --name MONITOR-PASSWORD --query "value != 'REPLACE_ME'" -o tsv
az keyvault secret show --vault-name kv-elyse-shared --name MONITOR-TOTP-SEED --query "value != 'REPLACE_ME'" -o tsv
```

The last command should print `false` until you finish this section. To **use** UPN/password locally, copy them from the Portal Key Vault blade or `az keyvault secret show ... --query value -o tsv` in a private terminal you will not paste from.

2. In a **private** browser (Incognito / InPrivate) on a machine that will not stay signed in as the monitor, open `https://elysetindall.com/studio/health` (or staging `https://test.elysetindall.com/studio/health`, or `https://aka.ms/mfasetup`) and sign in with `MONITOR-UPN` / `MONITOR-PASSWORD`.

3. Security Defaults prompts **More information required** / register MFA.

4. Choose **Authenticator app**, then **I want to use a different authenticator app** (wording varies: “set up another authenticator app”, “Can't scan image”). **Do not** finish with Microsoft Authenticator notification approval / number matching only — that path never reveals a seed.

5. When the QR appears, also open **Can't scan image** / **secret key**. Copy the **Base32 secret** (letters A–Z and digits 2–7, typically 16–32 characters). The QR’s `otpauth://totp/...?secret=...` query param is the same value. Photograph the QR only on a device you control.

6. Confirm a 6-digit code **before** leaving the Entra page:

```bash
# Linux/macOS if oathtool is installed:
oathtool --totp --base32 '<paste-seed-only-in-this-private-shell>'
```

Or add the seed to a password-manager TOTP field. Complete Entra enrollment with that code.

7. Write the seed to Key Vault **from a file**, never from a one-liner that lands in shell history:

```bash
# seed.txt: 0600, single line, no quotes, no whitespace
az keyvault secret set --vault-name kv-elyse-shared --name MONITOR-TOTP-SEED --file seed.txt
shred -u seed.txt
# Windows: Delete seed.txt from Explorer after the set succeeds; do not keep it in Downloads.
```

8. Re-run **CD: main** (workflow dispatch) or wait for the next push. Smoke logs should say Playwright Studio login **will run**, not skip.

9. Sign out of the monitor session on the operator machine.

### Good vs bad

| Good | Bad |
|------|-----|
| Secret is Base32 (`JBSWY3DPEHPK3PXP` style) | Pasting a 6-digit code into KV (codes expire in 30s) |
| “Different authenticator app” + visible secret key | Microsoft Authenticator push / number matching only |
| `az keyvault secret set --file` | `echo $SEED`, pasting the seed into a PR, chat, or ticket |
| Password manager or `oathtool` as the second factor during enroll | Enrolling only on Elyse’s phone as the sole factor |

## Rotation

**TOTP seed**

1. Entra admin center → Users → Studio monitor → Authentication methods → delete the authenticator / software OATH method (or Security info while signed in as the monitor).
2. Sign in as the monitor again and repeat capture steps 3–7 (new seed).
3. `az keyvault secret set --vault-name kv-elyse-shared --name MONITOR-TOTP-SEED --file new-seed.txt` then delete the file.

**Password** (Terraform-managed)

```bash
cd infra/bootstrap
terraform apply -replace=random_password.monitor
```

Then sign in once with the new password from KV (TOTP seed unchanged unless Entra also forces re-enrollment).

## Failure diagnostics (first step)

| Symptom | First check |
|---------|-------------|
| Smoke skips Studio login | `MONITOR-TOTP-SEED` still `REPLACE_ME`, or bootstrap user not created |
| `client_credentials` skipped | Identifier URI not on the SWA app yet — apply env Terraform (`Monitor.Ping` + self-assignment) |
| Interactive login fails `AADSTS50105` | Enterprise-app **Assignment required** is on. User login must stay open (`require_app_role_assignment = false`). Re-apply the env stack; do not assign the tester in Users and groups as a workaround. Authorization stays on the allowlist / owner key. |
| `client_credentials` fails `AADSTS501051` | Assignment required is on, and the SWA service principal is missing the **Monitor.Ping** self-assignment (`principalType: ServicePrincipal`). Staging/prod should both list that assignment on `appRoleAssignedTo`. `az ad app permission admin-consent` grants Graph `User.Read` but can **drop** application-type self-assignments that are not in the app’s API permissions. Restore with env `terraform apply` (resource `azuread_app_role_assignment.monitor_ping_self`), then re-run smoke. |
| `client_credentials` fails (other) | `AAD-CLIENT-SECRET` / identifier URI `api://{AAD_CLIENT_ID}` |
| Entra “Need admin approval” | Identifier URI / `Monitor.Ping` made the login app an API. Prefer Terraform `azuread_application_pre_authorized` plus a delegated Graph grant. If you use `az ad app permission admin-consent`, **re-apply env Terraform immediately** so `Monitor.Ping` self-assignment is restored. |
| Redirect loop / AADSTS50011 | `terraform output entra_redirect_uris` vs hostname used in smoke |
| Health 200 but URL stays `/studio` | SWA 401 override hardcodes `post_login_redirect_uri=/studio`; smoke asserts the canary via authenticated fetch |
| Signed in but Studio deny + `Reference:` | Monitor was added to `ALLOWED-USER-IDS` — remove it |
| Playwright timeout on `input[name="otc"]` | MFA is push/number-match; re-enroll with a visible secret key |

Failed-run Playwright traces/video/HAR (HAR redacted) upload as a 7-day Actions artifact on smoke failure. Treat them as restricted: they may still show the login UI.

## Related

- [rotate-secrets.md](rotate-secrets.md) — `MONITOR-*` rows
- [testing-strategy.md](testing-strategy.md) — smoke jobs
- [setup.md](../setup.md) — Entra login (assignment required stays off)
- [manage-access.md](manage-access.md) — sign-in vs publish allowlist
- [infra/bootstrap/README.md](../../infra/bootstrap/README.md)
