/**
 * Self-serve account fields (ACCOUNT-P2-002).
 */
import {
  CrmValidationError,
  DEFAULT_CONTACT_TIMEZONE,
  normalizeContactInput,
  STUDIO_STUDENT_FORMATS,
} from './contacts.js';
import { isAppleRelayEmail } from './contactPrincipal.js';

export const CONTACT_SELF_SERVE_PERSONAS = ['student', 'parent'];

function trimTo(value, max) {
  return String(value || '').trim().slice(0, max);
}

export function normalizeTimezone(value) {
  const tz = trimTo(value, 80);
  if (!tz) return DEFAULT_CONTACT_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    throw new CrmValidationError('Choose a valid time zone.');
  }
}

function filterSelfServePersonas(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const persona = String(raw || '').trim().toLowerCase();
    if (!CONTACT_SELF_SERVE_PERSONAS.includes(persona) || seen.has(persona)) continue;
    seen.add(persona);
    out.push(persona);
  }
  return out;
}

/**
 * @param {Record<string, unknown>} input
 */
export function normalizeAccountPatch(input) {
  const src = input && typeof input === 'object' ? input : {};
  const has = (key) => Object.prototype.hasOwnProperty.call(src, key);
  const patch = {};

  if (has('displayName') || has('email') || has('phone')) {
    const core = normalizeContactInput(
      {
        ...(has('displayName') ? { displayName: src.displayName } : {}),
        ...(has('email') ? { email: src.email } : {}),
        ...(has('phone') ? { phone: src.phone } : {}),
        personas: ['student'],
      },
      { partial: true },
    );
    if (has('displayName')) patch.displayName = core.displayName;
    if (has('email')) patch.email = core.email;
    if (has('phone')) patch.phone = core.phone;
  }

  if (has('studentFormat')) {
    const format = String(src.studentFormat || '').trim().toLowerCase();
    if (format && !STUDIO_STUDENT_FORMATS.includes(format)) {
      throw new CrmValidationError('Format must be NYC or Zoom.');
    }
    patch.studentFormat = format;
  }

  if (has('studentSmsOk')) {
    patch.studentSmsOk = Boolean(src.studentSmsOk);
  }

  if (has('timezone')) {
    patch.timezone = normalizeTimezone(src.timezone);
  }

  if (has('personas')) {
    const personas = filterSelfServePersonas(src.personas);
    if (personas.length === 0) {
      throw new CrmValidationError('Choose student and/or parent.');
    }
    patch.personas = personas;
  }

  return patch;
}

/**
 * @param {object | null} contact
 */
export function publicAccountProfile(contact) {
  if (!contact) return null;
  const personas = filterSelfServePersonas(contact.personas);
  const email = String(contact.email || '');
  return {
    id: contact.id,
    displayName: contact.displayName,
    email,
    phone: contact.phone || '',
    personas,
    studentFormat: contact.studentFormat || '',
    studentSmsOk: Boolean(contact.studentSmsOk),
    timezone: contact.timezone || DEFAULT_CONTACT_TIMEZONE,
    needsPersonaChoice: personas.length === 0,
    appleRelayEmail: isAppleRelayEmail(email),
    etag: contact.etag || '',
  };
}
