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
