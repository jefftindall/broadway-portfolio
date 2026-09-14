import { app } from '@azure/functions';
import { listAccountLessons } from '../lib/contactAccountLessons.js';
import {
  contactFeatureDisabled,
  contactForbidden,
  contactGate,
  contactSignInRequired,
} from '../lib/contactAccess.js';
import { contactsStoreFromEnv } from '../lib/contacts.js';
import { contactIdentitiesStoreFromEnv } from '../lib/contactIdentities.js';
import { ensureLinkedContact } from '../lib/contactLink.js';
import { providerKindForLog } from '../lib/authRoles.js';
import { accountFailureResponse } from '../lib/httpErrors.js';
import { lessonsStoreFromEnv } from '../lib/lessons.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

async function requireContact(request, operation) {
  const gate = await contactGate(request);
  if (!gate.featureEnabled) {
    return { error: contactFeatureDisabled(gate.correlationId) };
  }
  if (!gate.signedIn) {
    return { error: contactSignInRequired(gate.correlationId) };
  }
  if (!gate.allowed) {
    trackEvent('ContactAccessDenied', {
      correlationId: gate.correlationId,
      operation,
      providerKind: providerKindForLog(gate.principal),
    });
    await flush();
    return {
      error: contactForbidden(
        gate.correlationId,
        'Sign in with a student or parent account to view lesson history.',
      ),
    };
  }
  return { gate };
}

app.http('accountLessons', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'accountLessons',
  handler: async (request, context) => {
    const authed = await requireContact(request, 'history');
    if (authed.error) return { ...authed.error, headers: jsonHeaders() };
    const { gate } = authed;
    const correlationId = gate.correlationId;

    try {
      const contactsStore = contactsStoreFromEnv();
      const identitiesStore = contactIdentitiesStoreFromEnv();
      const linked = await ensureLinkedContact({
        contactsStore,
        identitiesStore,
        principal: gate.principal,
      });
      const lessons = lessonsStoreFromEnv();
      const history = await listAccountLessons({
        contact: linked.contact,
        lessons,
        contactsStore,
      });

      trackEvent('ContactAccountOp', {
        correlationId,
        operation: 'history',
        contactId: linked.contact.id,
        upcomingCount: history.upcoming.length,
        pastCount: history.past.length,
      });
      await flush();

      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: {
          upcoming: history.upcoming,
          past: history.past,
          correlationId,
        },
      };
    } catch (err) {
      const failure = accountFailureResponse(err, correlationId);
      context.warn('Contact account lessons failed', {
        correlationId,
        operation: 'history',
        errorKind: failure.errorKind,
      });
      if (failure.status >= 500) {
        trackException(err, { correlationId, operation: 'history', errorKind: failure.errorKind });
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
