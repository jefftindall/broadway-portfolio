/**
 * Map internal Studio failures to user-safe HTTP responses.
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
