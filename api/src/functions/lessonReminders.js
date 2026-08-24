import { app } from '@azure/functions';
import { newCorrelationId } from '../lib/auth.js';
import { tryContactsStoreFromEnv } from '../lib/contacts.js';
import { tryLessonsStoreFromEnv } from '../lib/lessons.js';
import {
  sendLessonReminderEmail,
  tomorrowWindowInTimeZone,
} from '../lib/studioComms.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

function remindersEnabled(env = process.env) {
  const raw = String(env.STUDIO_LESSON_REMINDERS_ENABLED || 'true').trim().toLowerCase();
  return raw !== 'false' && raw !== '0';
}

export async function runLessonReminders({ env = process.env, now = new Date() } = {}) {
  if (!remindersEnabled(env)) {
    return { skipped: true, reason: 'disabled', sent: 0 };
  }
  const lessons = tryLessonsStoreFromEnv(env);
  const contacts = tryContactsStoreFromEnv(env);
  if (!lessons || !contacts) {
    return { skipped: true, reason: 'store_unconfigured', sent: 0 };
  }

  const { dayKey, startIso, endIso } = tomorrowWindowInTimeZone(undefined, now);
  const listed = await lessons.list({
    from: startIso,
    to: endIso,
    status: 'confirmed',
    includeCancelled: false,
  });

  let sent = 0;
  const correlationId = newCorrelationId();

  for (const lesson of listed.lessons || []) {
    if (lesson.reminderSentOn === dayKey) continue;
    try {
      const contact = await contacts.get(lesson.contactId);
      await sendLessonReminderEmail({
        lesson,
        contact,
        correlationId,
        env,
        sms: Boolean(contact.studentSmsOk),
      });
      await lessons.update(lesson.id, { reminderSentOn: dayKey });
      sent += 1;
    } catch {
      // Idempotent next day is wrong — leave reminderSentOn empty to retry tomorrow's run
      // only if still within window; for simplicity we skip marking failed sends.
    }
  }

  trackEvent('StudioLessonRemindersRun', { correlationId, sent, dayKey });
  await flush();
  return { sent, dayKey, correlationId };
}

app.timer('lessonReminders', {
  schedule: '0 0 14 * * *',
  handler: async (_timer, context) => {
    try {
      const result = await runLessonReminders();
      context.log('Studio lesson reminders finished', {
        sent: result.sent,
        dayKey: result.dayKey || '',
        skipped: result.skipped || false,
      });
    } catch (err) {
      const correlationId = newCorrelationId();
      trackException(err, { correlationId, operation: 'lessonReminders' });
      await flush();
      context.warn('Studio lesson reminders failed', {
        correlationId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },
});
