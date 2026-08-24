import { app } from '@azure/functions';
import { forbidden, newCorrelationId, publisherIdentity, signInRequired } from '../lib/auth.js';
import { contactsStoreFromEnv } from '../lib/contacts.js';
import { crmFailureResponse } from '../lib/httpErrors.js';
import { lessonsStoreFromEnv } from '../lib/lessons.js';
import { PERMISSION, permissionGate } from '../lib/studioAccess.js';
import { STUDIO_COMMS_TEMPLATES, sendStudioTemplateEmail } from '../lib/studioComms.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

app.http('studioComms', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'studioComms',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const gate = await permissionGate(request, PERMISSION.PEOPLE_WRITE);
    if (!gate.signedIn) {
      return { ...signInRequired(correlationId), headers: jsonHeaders() };
    }
    if (!gate.allowed) {
      const identity = publisherIdentity(gate.principal);
      trackEvent('StudioAccessDenied', {
        ...identity,
        correlationId,
        route: 'studioComms',
        permission: PERMISSION.PEOPLE_WRITE,
      });
      await flush();
      return {
        ...forbidden(correlationId, 'This account is signed in but cannot edit People.'),
        headers: jsonHeaders(),
      };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return {
        status: 400,
        headers: jsonHeaders(),
        jsonBody: { error: 'Please check the form fields and try again.', correlationId },
      };
    }

    const template = String(body?.template || '').trim();
    const contactId = String(body?.contactId || '').trim();
    const lessonId = String(body?.lessonId || '').trim();

    if (!STUDIO_COMMS_TEMPLATES.includes(template)) {
      return {
        status: 400,
        headers: jsonHeaders(),
        jsonBody: { error: 'Choose a message template.', correlationId },
      };
    }
    if (!contactId) {
      return {
        status: 400,
        headers: jsonHeaders(),
        jsonBody: { error: 'A person is required.', correlationId },
      };
    }

    try {
      const contacts = contactsStoreFromEnv();
      const contact = await contacts.get(contactId);
      let lesson;
      if (lessonId) {
        lesson = await lessonsStoreFromEnv().get(lessonId);
      } else if (template === 'lesson_confirm_resend' || template === 'lesson_reminder') {
        return {
          status: 400,
          headers: jsonHeaders(),
          jsonBody: { error: 'Choose a lesson for this template.', correlationId },
        };
      }

      await sendStudioTemplateEmail({ template, contact, lesson, correlationId });
      trackEvent('StudioCommsSent', { correlationId, template, contactId, lessonId: lessonId || '' });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: { ok: true, correlationId },
      };
    } catch (err) {
      const failure = crmFailureResponse(err, correlationId);
      context.warn('Studio comms send failed', {
        correlationId,
        errorKind: failure.errorKind,
        template,
        contactId,
      });
      if (failure.status >= 500) {
        trackException(err, {
          correlationId,
          operation: 'studioComms',
          errorKind: failure.errorKind,
        });
      }
      await flush();
      return {
        status: failure.status,
        headers: jsonHeaders(),
        jsonBody: failure.jsonBody,
      };
    }
  },
});
