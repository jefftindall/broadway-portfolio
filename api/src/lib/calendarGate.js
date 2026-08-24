/**
 * Lesson scheduling gate — same SWA flag as public Payment Links.
 */
import { forbidden } from './auth.js';
import { lessonSchedulingEnabledFromEnv } from './lessonPayConfig.js';

/**
 * @param {string} correlationId
 */
export function lessonSchedulingDisabledResponse(correlationId) {
  return forbidden(
    correlationId,
    'Lesson scheduling is not enabled in this environment yet.',
  );
}

/**
 * @param {string} correlationId
 * @param {NodeJS.ProcessEnv} [env]
 */
export function requireLessonScheduling(correlationId, env = process.env) {
  if (!lessonSchedulingEnabledFromEnv(env)) {
    return { error: lessonSchedulingDisabledResponse(correlationId) };
  }
  return {};
}
