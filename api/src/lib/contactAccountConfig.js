/**
 * Public contact-account feature flag. Never include secrets or PII.
 */

import { flagEnabled } from './lessonPayConfig.js';

/**
 * @param {unknown} enabledFlag
 * @returns {{ enabled: boolean }}
 */
export function publicContactAccountConfig({ enabledFlag } = {}) {
  return { enabled: flagEnabled(enabledFlag) };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function publicContactAccountConfigFromEnv(env = process.env) {
  return publicContactAccountConfig({ enabledFlag: env.CONTACT_ACCOUNTS_ENABLED });
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function contactAccountsEnabledFromEnv(env = process.env) {
  return flagEnabled(env.CONTACT_ACCOUNTS_ENABLED);
}
