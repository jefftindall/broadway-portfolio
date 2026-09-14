import { app } from '@azure/functions';
import {
  CONTACT_SELF_SERVE_PERSONAS,
  normalizeAccountPatch,
  publicAccountProfile,
} from '../lib/accountProfile.js';
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
import { loadBookableStudents } from '../lib/contactAccountLessons.js';
import { accountFailureResponse } from '../lib/httpErrors.js';
import { tryLedgerStoreFromEnv } from '../lib/ledger.js';
import { flush, trackEvent, trackException } from '../lib/telemetry.js';

function jsonHeaders() {
  return { 'Cache-Control': 'private, no-store' };
}

function accountLog(context, message, { correlationId, operation, contactId, errorKind }) {
  context.warn(message, {
    correlationId,
    operation,
    errorKind,
    ...(contactId ? { contactId } : {}),
  });
}

async function fail(err, { context, correlationId, operation, contactId }) {
  const failure = accountFailureResponse(err, correlationId);
  accountLog(context, 'Contact account failed', {
    correlationId,
    operation,
    contactId,
    errorKind: failure.errorKind,
  });
  if (failure.status >= 500) {
    trackException(err, {
      correlationId,
      operation,
      errorKind: failure.errorKind,
      ...(contactId ? { contactId } : {}),
    });
  }
  trackEvent('ContactAccountFailed', {
    correlationId,
    operation,
    errorKind: failure.errorKind,
    ...(contactId ? { contactId } : {}),
  });
  await flush();
  return {
    status: failure.status,
    headers: jsonHeaders(),
    jsonBody: failure.jsonBody,
  };
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
        'Sign in with a student or parent account to manage your profile.',
      ),
    };
  }
  return { gate };
}

app.http('account', {
  methods: ['GET', 'PATCH'],
  authLevel: 'anonymous',
  route: 'account',
  handler: async (request, context) => {
    const operation = request.method === 'PATCH' ? 'update' : 'get';
    const authed = await requireContact(request, operation);
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
      const contactId = linked.contact.id;

      if (request.method === 'GET') {
        trackEvent('ContactAccountOp', {
          correlationId,
          operation: 'get',
          contactId,
          linked: linked.linked,
          created: linked.created,
        });
        await flush();
        const bookableStudents = await loadBookableStudents(contactsStore, linked.contact);
        return {
          status: 200,
          headers: jsonHeaders(),
          jsonBody: {
            account: {
              ...publicAccountProfile(linked.contact),
              bookableStudents,
            },
            correlationId,
          },
        };
      }

      const body = await request.json();
      const patch = normalizeAccountPatch(body || {});
      if (Object.keys(patch).length === 0) {
        return {
          status: 400,
          headers: jsonHeaders(),
          jsonBody: {
            error: 'Nothing to update.',
            correlationId,
          },
        };
      }
      if (patch.personas) {
        const operatorPersonas = (linked.contact.personas || []).filter(
          (persona) => !CONTACT_SELF_SERVE_PERSONAS.includes(persona),
        );
        patch.personas = [...new Set([...operatorPersonas, ...patch.personas])];
      }
      const etag = request.headers.get('if-match') || body?.etag || '';
      const updated = await contactsStore.update(contactId, patch, { etag });
      if (patch.email && patch.email !== linked.contact.email) {
        const ledger = tryLedgerStoreFromEnv(process.env, { contacts: contactsStore });
        if (ledger) await ledger.rematchUnmatchedForEmail(patch.email);
      }
      trackEvent('ContactAccountOp', { correlationId, operation: 'update', contactId });
      await flush();
      return {
        status: 200,
        headers: jsonHeaders(),
        jsonBody: {
          account: publicAccountProfile(updated),
          correlationId,
        },
      };
    } catch (err) {
      return fail(err, { context, correlationId, operation });
    }
  },
});
