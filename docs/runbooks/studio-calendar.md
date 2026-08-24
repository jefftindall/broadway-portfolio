# Runbook: Studio Google Calendar

Connect Google Calendar so Studio can create voice-lesson invites Elyse **Accepts** on her phone. Time lives on Google when connected. Lesson **workflow** (`requested` / `confirmed` / `declined` / `cancelled`) lives in Table Storage so the site keeps working if Google is down.

Do **not** put refresh tokens, client secrets, or student emails in git, chat, or PR bodies.

## What ships

| Surface | Route | Permission |
|---------|-------|------------|
| Connect | `/studio/admin/calendar` | `calendar.connect` (Super Administrator by default) |
| Lesson times | `/studio/calendar` | `calendar.read` / `calendar.write` (People role includes these) |
| Help | `/studio/help/calendar` | Signed-in |

**Integration:** a dedicated **Studio Google account** is the event organizer. It invites Elyse (and the student when they have an email). Elyse Accepts in Google Calendar. Optional second connect: Elyse’s own Google, used only to read free/busy on calendars she selects.

Stay in Google Cloud **Testing** with named test users (Elyse + operator). Do not block on public OAuth verification / CASA for this single-coach app.

## One-time Google Cloud setup

1. In a GCP project, enable **Google Calendar API**.
2. Create an OAuth 2.0 **Web application** client.
3. Authorized redirect URIs (exact):
   - `https://elysetindall.com/studio/admin/calendar`
   - `https://test.elysetindall.com/studio/admin/calendar`
   - `http://localhost:4280/studio/admin/calendar` (SWA CLI, if used)
4. Add Elyse and the operator as **test users**.
5. Store the client id and secret in each env vault (never echo values):

```bash
az keyvault secret set --vault-name kv-elyse-staging --name GOOGLE-CALENDAR-CLIENT-ID --value "<id>"
az keyvault secret set --vault-name kv-elyse-staging --name GOOGLE-CALENDAR-CLIENT-SECRET --file ./gcal-client-secret.txt
az keyvault secret set --vault-name kv-elyse-prod --name GOOGLE-CALENDAR-CLIENT-ID --value "<id>"
az keyvault secret set --vault-name kv-elyse-prod --name GOOGLE-CALENDAR-CLIENT-SECRET --file ./gcal-client-secret.txt
```

6. Sync SWA (`./scripts/sync-swa-api-secrets.sh staging|prod` or terraform apply). See [rotate-secrets.md](./rotate-secrets.md).
7. Create a dedicated Studio Gmail (or Workspace) user. Sign into `/studio/admin/calendar` as a Super Administrator and **Connect Google** as that organizer. Optionally **Connect Elyse’s Google** and tick the calendars that should block lesson times (shows, personal, lessons).

Refresh tokens from Connect are stored in Table `studioCalendar` (runtime SoT). Key Vault `GOOGLE-CALENDAR-ORGANIZER-REFRESH-TOKEN` / `GOOGLE-CALENDAR-ELYSE-REFRESH-TOKEN` are placeholders for an operator bootstrap or rotate path — Functions cannot write Key Vault.

## When Google is down

Creating a lesson still saves a **Requested** row. Studio emails `SITE-CONTACT-EMAIL` (SWA `CONTACT_NOTIFY_EMAIL`) an ICS `METHOD:REQUEST` whose UID is the lesson id, plus Confirm / Decline links. Recipients are never `ALERT-*`.

Student **Requested** / **Confirmed** mail is [`STUDIO-P4-002`](../plans/studio-teaching-business.md) — not this runbook.

Public inquire/book, People, payments, and publish do not require Calendar tokens.

## Requested vs Confirmed

| Status | How it happens |
|--------|----------------|
| `requested` | Lesson created in Studio |
| `confirmed` | Elyse Accepts the Google invite, or taps Confirm in Studio / the ICS email |
| `declined` | Elyse Declines in Google, or taps Decline in Studio / the email |
| `cancelled` | Cancel in Studio (one week of a series does **not** delete the series) |

Last-write: a Studio Confirm / Decline / Cancel wins if the operator acts there; a later Google RSVP wins when sync or `events.watch` runs.

## Weekly series

Max **12** instances (one quarter). Google gets `RRULE:FREQ=WEEKLY;COUNT=n`. Cancel one week marks that instance cancelled.

## Re-consent

If Google revokes a grant, Calendar UI shows disconnected (not a 500). Reconnect from `/studio/admin/calendar`. The rest of Studio stays usable.

## Logs

Kinds + `correlationId` + lesson id / role only. Never tokens, addresses, or event descriptions.
