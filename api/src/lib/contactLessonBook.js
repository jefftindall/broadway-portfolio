/**
 * Contact-session lesson schedule + book helpers (ACCOUNT-P3-*).
 */
import {
  contactBookSignInRequired,
  contactForbidden,
  contactGate,
} from './contactAccess.js';
import { contactsStoreFromEnv } from './contacts.js';
import { contactIdentitiesStoreFromEnv } from './contactIdentities.js';
import { ensureLinkedContact } from './contactLink.js';
import { providerKindForLog } from './authRoles.js';
import { accessTokenForRefresh, createGoogleCalendarClient } from './googleCalendar.js';
import { computeOpenSlots } from './lessonSlots.js';
import { tryCalendarSettingsStoreFromEnv } from './calendarSettings.js';
import { flush, trackEvent } from './telemetry.js';

export const CONTACT_BOOK_MAX_PER_24H = 5;
export const CONTACT_BOOK_WINDOW_MS = 24 * 60 * 60 * 1000;

export class ContactLessonRateLimitError extends Error {
  constructor() {
    super('Too many booking requests. Please try again later.');
    this.name = 'ContactLessonRateLimitError';
  }
}

export function contactBookFeatureDisabled(correlationId) {
  return {
    status: 404,
    jsonBody: {
      error: 'Online scheduling is not available right now.',
      correlationId,
    },
  };
}

export async function fetchElyseFreeBusy({ settings, timeMin, timeMax, env = process.env }) {
  const elyse = await settings.getConnection('elyse');
  const availability = await settings.getAvailability();
  if (!elyse.connected) {
    return { connected: false, busy: [], availability };
  }
  try {
    const token = await accessTokenForRefresh(elyse.refreshToken, env);
    const client = createGoogleCalendarClient({ accessToken: token });
    const calendarIds = availability.calendarIds.length ? availability.calendarIds : ['primary'];
    const { busy } = await client.freeBusy({ calendarIds, timeMin, timeMax });
    return { connected: true, busy, availability };
  } catch {
    return { connected: false, busy: [], availability };
  }
}

export async function assertContactBookRateLimit({ lessons, contactId, now = Date.now() }) {
  const since = new Date(now - CONTACT_BOOK_WINDOW_MS).toISOString();
  const { lessons: recent } = await lessons.list({
    contactId,
    from: since,
    includeCancelled: true,
  });
  const created = recent.filter((row) => {
    const stamp = Date.parse(row.createdAt || row.startAt);
    return Number.isFinite(stamp) && stamp >= now - CONTACT_BOOK_WINDOW_MS;
  });
  if (created.length >= CONTACT_BOOK_MAX_PER_24H) {
    throw new ContactLessonRateLimitError();
  }
}

/**
 * Gate contact booking APIs: flag on, contact session, linked People row.
 */
export async function requireContactBooking(request, operation) {
  const gate = await contactGate(request);
  if (!gate.featureEnabled) {
    return { error: contactBookFeatureDisabled(gate.correlationId) };
  }
  if (!gate.signedIn) {
    return { error: contactBookSignInRequired(gate.correlationId) };
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
        'Sign in with a student or parent account to book a lesson.',
      ),
    };
  }

  const contactsStore = contactsStoreFromEnv();
  const identitiesStore = contactIdentitiesStoreFromEnv();
  const linked = await ensureLinkedContact({
    contactsStore,
    identitiesStore,
    principal: gate.principal,
  });

  return {
    gate,
    contact: linked.contact,
    contactId: linked.contact.id,
    correlationId: gate.correlationId,
    contactsStore,
  };
}

export async function loadContactSchedule({
  durationMin,
  now = Date.now(),
  env = process.env,
}) {
  const settings = tryCalendarSettingsStoreFromEnv(env);
  if (!settings) {
    return { connected: false, slots: [], availability: null };
  }
  const timeMin = new Date(now).toISOString();
  const timeMax = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { connected, busy, availability } = await fetchElyseFreeBusy({
    settings,
    timeMin,
    timeMax,
    env,
  });
  if (!connected) {
    return { connected: false, slots: [], availability };
  }
  const slots = computeOpenSlots({
    busy,
    availability,
    durationMin,
    now,
  });
  return { connected: true, slots, availability };
}
