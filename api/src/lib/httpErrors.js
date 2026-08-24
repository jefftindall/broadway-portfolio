/**
 * Map internal Studio / contact failures to user-safe HTTP responses.
 * Full error detail stays in Function logs + App Insights (via correlationId).
 */

const MSG_TEMPORARY =
  'Publishing is temporarily unavailable. Please try again in a few minutes.';
const MSG_NOT_CONFIGURED =
  'Publishing isn’t configured right now. Please try again later or contact support.';
const MSG_GENERIC =
  'Something went wrong while publishing. Share the reference below with support.';
const MSG_UPLOAD =
  'Something went wrong while uploading. Share the reference below with support.';
const MSG_CONTENT_INVALID =
  'Some content fields are invalid. Review the preview and fix missing or incorrect values before publishing.';

const MSG_CONTACT_TEMPORARY =
  'We couldn’t send your message right now. Please try again in a few minutes.';
const MSG_CONTACT_CONFIG =
  'Contact forms aren’t configured right now. Please try again later or use the email link on this page.';
const MSG_CONTACT_GENERIC =
  'Something went wrong while sending your message. Share the reference below if you need help.';
const MSG_CONTACT_TURNSTILE =
  'Please complete the verification check and try again.';
const MSG_CONTACT_VALIDATION =
  'Please check the form fields and try again.';

const MSG_CRM_GENERIC =
  'Something went wrong while loading people. Share the reference below with support.';
const MSG_CRM_CONFIG =
  'People isn’t configured right now. Please try again later or contact support.';
const MSG_CRM_NOT_FOUND = 'That person isn’t in Studio.';
const MSG_CRM_UNAUTHORIZED = 'Sign in to use Studio.';
const MSG_CRM_FORBIDDEN = 'This account is signed in but cannot manage People.';
const MSG_ACCESS_GENERIC =
  'Something went wrong while loading access. Share the reference below with support.';
const MSG_ACCESS_CONFIG =
  'Access isn’t configured right now. Please try again later or contact support.';
const MSG_ACCESS_NOT_FOUND = 'That access record isn’t in Studio.';
const MSG_CALENDAR_GENERIC =
  'Something went wrong with the schedule. Share the reference below with support.';
const MSG_CALENDAR_CONFIG =
  'Calendar isn’t configured right now. You can still type a lesson time. Share the reference below if you need help.';
const MSG_CALENDAR_DISCONNECTED =
  'Google Calendar isn’t connected or the sign-in expired. Reconnect under Admin → Calendar.';
const MSG_CALENDAR_NOT_FOUND = 'That lesson isn’t in Studio.';

/**
 * @param {unknown} err
 * @returns {{ errorKind: string, status: number, error: string }}
 */
export function classifyStudioError(err, { operation = 'updateContent' } = {}) {
  const message = err instanceof Error ? err.message : String(err || '');
  const lower = message.toLowerCase();

  if (err instanceof Error && err.name === 'StudioContentValidationError') {
    return {
      errorKind: 'content_validation',
      status: 400,
      error: err.message || MSG_CONTENT_INVALID,
    };
  }

  if (
    /missing gemini_api_key|missing github_|github_app|github_token|not configured/i.test(
      message,
    )
  ) {
    return { errorKind: 'config', status: 500, error: MSG_NOT_CONFIGURED };
  }

  if (
    /429|too many requests|quota|rate.?limit|resource_exhausted|retry in/i.test(lower) ||
    /googlegenerativeai/i.test(message)
  ) {
    const isQuota =
      /quota|rate.?limit|too many requests|429|resource_exhausted/i.test(lower);
    return {
      errorKind: isQuota ? 'gemini_quota' : 'gemini',
      status: isQuota ? 503 : 500,
      error: isQuota ? MSG_TEMPORARY : MSG_GENERIC,
    };
  }

  if (/octokit|github|contents api|commit/i.test(lower)) {
    return { errorKind: 'github', status: 500, error: MSG_GENERIC };
  }

  return {
    errorKind: 'unknown',
    status: 500,
    error: operation === 'uploadMedia' ? MSG_UPLOAD : MSG_GENERIC,
  };
}

/**
 * @param {unknown} err
 * @param {string} correlationId
 * @param {{ operation?: string }} [opts]
 */
export function studioFailureResponse(err, correlationId, opts = {}) {
  const classified = classifyStudioError(err, opts);
  return {
    status: classified.status,
    jsonBody: {
      error: classified.error,
      correlationId,
    },
    errorKind: classified.errorKind,
  };
}

/**
 * @param {unknown} err
 * @returns {{ errorKind: string, status: number, error: string }}
 */
export function classifyContactError(err) {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err || '');
  const lower = message.toLowerCase();

  if (name === 'ContactValidationError' || name === 'ZodError') {
    return {
      errorKind: 'validation',
      status: 400,
      error: MSG_CONTACT_VALIDATION,
    };
  }

  if (name === 'ContactTurnstileRejected') {
    return {
      errorKind: 'turnstile_rejected',
      status: 400,
      error: MSG_CONTACT_TURNSTILE,
    };
  }

  if (name === 'ContactTurnstileError') {
    return {
      errorKind: 'turnstile',
      status: 503,
      error: MSG_CONTACT_TEMPORARY,
    };
  }

  if (name === 'ContactConfigError' || /missing (acs_|contact_|turnstile_)/i.test(message)) {
    return { errorKind: 'config', status: 500, error: MSG_CONTACT_CONFIG };
  }

  if (
    name === 'ContactAcsError' ||
    /communication|acs|emailclient|smsclient/i.test(lower)
  ) {
    const temporary = /429|throttl|timeout|temporar|unavailable/i.test(lower);
    return {
      errorKind: temporary ? 'acs_temporary' : 'acs',
      status: temporary ? 503 : 500,
      error: temporary ? MSG_CONTACT_TEMPORARY : MSG_CONTACT_GENERIC,
    };
  }

  return { errorKind: 'unknown', status: 500, error: MSG_CONTACT_GENERIC };
}

/**
 * @param {unknown} err
 * @param {string} correlationId
 */
export function contactFailureResponse(err, correlationId) {
  const classified = classifyContactError(err);
  return {
    status: classified.status,
    jsonBody: {
      error: classified.error,
      correlationId,
    },
    errorKind: classified.errorKind,
  };
}

/**
 * @param {unknown} err
 * @returns {{ errorKind: string, status: number, error: string }}
 */
export function classifyCrmError(err) {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err || '');
  const lower = message.toLowerCase();

  if (name === 'CrmUnauthorizedError') {
    return { errorKind: 'unauthorized', status: 401, error: MSG_CRM_UNAUTHORIZED };
  }
  if (name === 'CrmForbiddenError') {
    return { errorKind: 'forbidden', status: 403, error: message || MSG_CRM_FORBIDDEN };
  }
  if (name === 'CrmValidationError') {
    return {
      errorKind: 'validation',
      status: 400,
      error: message || 'Please check the person fields and try again.',
    };
  }
  if (name === 'StudioCommsError') {
    return {
      errorKind: 'comms',
      status: 400,
      error: message || 'Could not send that message.',
    };
  }
  if (name === 'CrmNotFoundError') {
    return { errorKind: 'not_found', status: 404, error: MSG_CRM_NOT_FOUND };
  }
  if (name === 'CrmConflictError') {
    return {
      errorKind: 'conflict',
      status: 409,
      error: message || 'Someone else updated this person. Refresh and try again.',
    };
  }
  if (
    name === 'CrmConfigError' ||
    /missing studio_crm|studio crm storage|table storage|not configured/i.test(message)
  ) {
    return { errorKind: 'config', status: 500, error: MSG_CRM_CONFIG };
  }
  if (/429|throttl|timeout|temporar|unavailable|econnreset/i.test(lower)) {
    return {
      errorKind: 'storage_temporary',
      status: 503,
      error: 'People is temporarily unavailable. Please try again in a few minutes.',
    };
  }
  return { errorKind: 'unknown', status: 500, error: MSG_CRM_GENERIC };
}

/**
 * @param {unknown} err
 * @param {string} correlationId
 */
export function crmFailureResponse(err, correlationId) {
  const classified = classifyCrmError(err);
  return {
    status: classified.status,
    jsonBody: {
      error: classified.error,
      correlationId,
    },
    errorKind: classified.errorKind,
  };
}

/**
 * @param {unknown} err
 * @returns {{ errorKind: string, status: number, error: string }}
 */
export function classifyAccessError(err) {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err || '');
  const lower = message.toLowerCase();

  if (name === 'AccessValidationError') {
    return {
      errorKind: 'validation',
      status: 400,
      error: message || 'Please check the access fields and try again.',
    };
  }
  if (name === 'AccessNotFoundError') {
    return { errorKind: 'not_found', status: 404, error: MSG_ACCESS_NOT_FOUND };
  }
  if (name === 'AccessConflictError') {
    return {
      errorKind: 'conflict',
      status: 409,
      error: message || 'Someone else updated this access record. Refresh and try again.',
    };
  }
  if (name === 'AccessConfigError' || /missing studio_users|studio users/i.test(message)) {
    return { errorKind: 'config', status: 500, error: MSG_ACCESS_CONFIG };
  }
  if (/429|throttl|timeout|temporar|unavailable|econnreset/i.test(lower)) {
    return {
      errorKind: 'storage_temporary',
      status: 503,
      error: 'Access is temporarily unavailable. Please try again in a few minutes.',
    };
  }
  return { errorKind: 'unknown', status: 500, error: MSG_ACCESS_GENERIC };
}

/**
 * @param {unknown} err
 * @returns {{ errorKind: string, status: number, error: string }}
 */
export function classifyCalendarError(err) {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err || '');
  const kind = err && typeof err === 'object' ? err.kind : '';
  const lower = message.toLowerCase();

  if (name === 'LessonValidationError' || name === 'CalendarValidationError') {
    return {
      errorKind: 'validation',
      status: 400,
      error: message || 'Please check the lesson fields and try again.',
    };
  }
  if (name === 'LessonNotFoundError' || name === 'CrmNotFoundError') {
    return { errorKind: 'not_found', status: 404, error: MSG_CALENDAR_NOT_FOUND };
  }
  if (name === 'LessonConflictError') {
    return {
      errorKind: 'conflict',
      status: 409,
      error: message || 'Someone else updated this lesson. Refresh and try again.',
    };
  }
  if (
    name === 'LessonConfigError' ||
    name === 'CalendarConfigError' ||
    kind === 'config' ||
    /missing (studio_lessons|studio_calendar|google_calendar)/i.test(message)
  ) {
    return { errorKind: 'config', status: 500, error: MSG_CALENDAR_CONFIG };
  }
  if (kind === 'revoked' || /invalid_grant|revoked/.test(lower)) {
    return { errorKind: 'revoked', status: 503, error: MSG_CALENDAR_DISCONNECTED };
  }
  if (
    name === 'GoogleCalendarError' ||
    name === 'CalendarOAuthError' ||
    kind === 'timeout' ||
    kind === 'quota' ||
    kind === 'google_temporary' ||
    /429|throttl|timeout|temporar|unavailable|econnreset/i.test(lower)
  ) {
    return {
      errorKind: kind || 'google_temporary',
      status: 503,
      error: 'Google Calendar is temporarily unavailable. The lesson request was still saved when possible.',
    };
  }
  if (name === 'ContactAcsError' || name === 'ContactConfigError') {
    return {
      errorKind: 'ics_fallback',
      status: 503,
      error: 'The lesson was saved, but the calendar reminder email could not be sent.',
    };
  }
  return { errorKind: 'unknown', status: 500, error: MSG_CALENDAR_GENERIC };
}

/**
 * @param {unknown} err
 * @param {string} correlationId
 */
export function calendarFailureResponse(err, correlationId) {
  const classified = classifyCalendarError(err);
  return {
    status: classified.status,
    jsonBody: {
      error: classified.error,
      correlationId,
    },
    errorKind: classified.errorKind,
  };
}

export function accessFailureResponse(err, correlationId) {
  const classified = classifyAccessError(err);
  return {
    status: classified.status,
    jsonBody: {
      error: classified.error,
      correlationId,
    },
    errorKind: classified.errorKind,
  };
}
