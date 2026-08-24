# Runbook: Studio Google Calendar

Connect Google Calendar so Studio can create voice-lesson invites Elyse **Accepts** on her phone. Time lives on Google when connected. Lesson **workflow** (`requested` / `confirmed` / `declined` / `cancelled`) lives in Table Storage so the site keeps working if Google is down.

Do **not** put refresh tokens, client secrets, or student emails in git, chat, or PR bodies.

## Feature flag

Lesson scheduling (Calendar connect, Schedules UI, `/api/lessons`, `/api/calendar*`) ships behind the same SWA app setting as public Payment Links: **`LESSON_PAYMENTS_ENABLED`**.

| Environment | Terraform `lesson_payments_enabled` | Calendar + Schedules |
|-------------|-------------------------------------|----------------------|
| Staging | `true` | Enabled |
| Prod | `false` (until go-live) | Hidden + API 403 |

`GET /api/studioSession` includes `lessonSchedulingEnabled` for Studio UI gating. Local dev: set `LESSON_PAYMENTS_ENABLED=true` in `api/local.settings.json` (and optional `PUBLIC_LESSON_PAYMENTS_ENABLED` for `/lessons/book` CTAs).

## What ships

| Surface | Route | Permission |
|---------|-------|------------|
| Connect | `/studio/admin/calendar` | `calendar.connect` (Super Administrator by default) |
| Lesson times | `/studio/calendar` | `calendar.read` / `calendar.write` (People role includes these) |
| Help | `/studio/help/calendar` | Signed-in |

**Integration:** a dedicated **Studio Google account** is the event organizer. It invites Elyse (and the student when they have an email). Elyse Accepts in Google Calendar. Optional second connect: Elyse’s own Google, used only to read free/busy on calendars she selects.

Stay in Google Cloud **Testing** with named test users (Elyse + operator). Do not block on public OAuth verification / CASA for this single-coach app.

## Staging vs production on one Google account

Elyse can connect the **same** Google account on **both** `test.elysetindall.com` and `elysetindall.com`:

| Concern | How it stays separate |
|---------|------------------------|
| OAuth tokens | Each Azure env stores refresh tokens in its own `studioCalendar` table (`stelysecrmstaging` vs `stelysecrmprod`) |
| OAuth redirect | `SITE_URL` per env → different redirect URIs on one GCP client |
| Push watch | Each env registers `events.watch` to its own `/api/calendarWatch` URL |
| Organizer events | Staging writes to the organizer calendar with **`[STAGING]`** summary prefix and `transparency: transparent` (shows as **Free** — does not block real lesson slots) |
| Prod events | Normal **Voice lesson** title, **Busy** (opaque) |
| Extended property | `studioEnvironment` = `staging` or `production` on every Google event (private extended property) |

Staging ICS email fallbacks use the same **`[STAGING]`** prefix and `TRANSP:TRANSPARENT`.

**Operator habit:** use staging for schedule QA; prod invites are real lesson times.

## One-time Google Cloud setup

### Google Cloud CLI (`gcloud`)

Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) and authenticate as an operator who can edit the GCP project.

```bash
# 1. Pick the GCP project (create one in Console if needed)
export GCP_PROJECT_ID="<your-project-id>"
gcloud config set project "$GCP_PROJECT_ID"

# 2. Confirm project
gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectId)'

# 3. Enable Google Calendar API
gcloud services enable calendar-json.googleapis.com

# 4. Verify Calendar API is enabled
gcloud services list --enabled --filter="name:calendar-json.googleapis.com"

# 5. (Optional) List other enabled services in the project
gcloud services list --enabled --format="table(name)" | head
```

OAuth 2.0 **Web application** client IDs are still created in **Google Cloud Console → APIs & Services → Credentials** (there is no stable `gcloud` create command for standard OAuth web clients). Use the same client for both sites — add every redirect URI below.

**OAuth consent screen (Testing):** Console → APIs & Services → OAuth consent screen → add Elyse and the operator under **Test users**.

### Console steps (after `gcloud` enable)

1. Create an OAuth 2.0 **Web application** client.
2. Authorized redirect URIs (exact):
   - `https://elysetindall.com/studio/admin/calendar`
   - `https://test.elysetindall.com/studio/admin/calendar`
   - `http://localhost:4280/studio/admin/calendar` (SWA CLI, if used)
3. Add Elyse and the operator as **test users** on the consent screen.
4. Store the client id and secret in each env vault (never echo values):

```bash
az keyvault secret set --vault-name kv-elyse-staging --name GOOGLE-CALENDAR-CLIENT-ID --value "<id>"
az keyvault secret set --vault-name kv-elyse-staging --name GOOGLE-CALENDAR-CLIENT-SECRET --file ./gcal-client-secret.txt
az keyvault secret set --vault-name kv-elyse-prod --name GOOGLE-CALENDAR-CLIENT-ID --value "<id>"
az keyvault secret set --vault-name kv-elyse-prod --name GOOGLE-CALENDAR-CLIENT-SECRET --file ./gcal-client-secret.txt
```

5. Sync SWA (`./scripts/sync-swa-api-secrets.sh staging|prod` or terraform apply). See [rotate-secrets.md](./rotate-secrets.md).
6. On **staging** (`LESSON_PAYMENTS_ENABLED=true`): sign into `/studio/admin/calendar` as a Super Administrator and **Connect Google** as the Studio organizer. Optionally **Connect Elyse’s Google** and tick calendars for free/busy.
7. Repeat Connect on **prod** when scheduling goes live there — tokens are env-specific; no shared Table row.

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
