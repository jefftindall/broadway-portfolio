# Runbook: Incident response (severity stub)

Short ack / triage stub for Sev1–Sev3. Full severity → channel table: [operational-excellence.md](../plans/operational-excellence.md#severity--channel-model). **Never** put alert emails, phones, or vendor routing keys in this doc, PRs, or the scorecard.

## Ack expectations

| Severity | Respond / silence |
|----------|-------------------|
| **Sev1** | Within **15 minutes** |
| **Sev2** | Same day |
| **Sev3** | Next working session |

Channels (email / SMS / voice) are Key Vault `ALERT-*` → Action Groups only — see [rotate-secrets.md](./rotate-secrets.md). Do **not** page via ACS inquiry SMS (`SITE-CONTACT-*`).

## Sev1 — first actions

Examples: homepage or materials availability fail; **Deploy Production** failed (`DeployFailed`); **Smoke Production** failed after release (`SmokeFailed`) — both page `ag-elyse-critical-prod`.

1. **Confirm blast radius** — open prod App Insights availability / recent `DeployFailed` or `SmokeFailed` (queries in [observability.md](./observability.md)). Check whether the public site still serves `/` and materials downloads.
2. **CD break** — GitHub Actions → failed **Deploy Production** or **Smoke Production** run. Prefer [deploy-and-rollback.md](./deploy-and-rollback.md) (revert + re-promote through staging smoke) over hot-patching prod. Prod smoke does **not** auto-rollback.
3. **Availability break** — check SWA health, recent merges, DNS ([dns-and-domain.md](./dns-and-domain.md)). Use Portal **Test action group** only to verify contacts, not as a substitute for fixing the site.
4. **Silence** — after recovery, confirm homepage/materials synthetics green and the critical alert has mitigated; note “receipt / recovery YYYY-MM-DD” in scorecard evidence without PII.

## Sev2 / Sev3

- **Sev2** (API error-budget burn vs SLO-7 99.9%/7d, Studio publish failures): email ± SMS via notify group. A single 5xx does not page — a minute counts only with 2+ server errors, and Sev2 needs 3+ such minutes in 2 days. Check `DeployStarted` / `DeployCompleted` if the window overlaps a publish ([observability.md](./observability.md)). Permission denials are not Sev1.
- **Sev3** (FCP p75 burn): email-only watch group. Score committed SLO-6 on the monthly scorecard (7d); the alert uses a shorter 2d watch window.

## Related

| Doc | Role |
|-----|------|
| [observability.md](./observability.md) | Kusto, Action Groups, SLO queries |
| [deploy-and-rollback.md](./deploy-and-rollback.md) | Promote / revert |
| [rotate-secrets.md](./rotate-secrets.md) | `ALERT-*` set + Sev1 prove-out |
| [manage-access.md](./manage-access.md) | Studio roles / permissions / Entra |
| [troubleshoot-build.md](./troubleshoot-build.md) | Build / CD OIDC failures |
| [swa-caching.md](./swa-caching.md) | Browser / image cache after a successful deploy |
