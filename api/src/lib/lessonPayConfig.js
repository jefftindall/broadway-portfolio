/**
 * Public lesson-pay config (Payment Links). Never include secret/restricted
 * keys or webhook secrets in this payload.
 */

export const LESSON_PAY_RATE_IDS = ['30min', '60min'];

const STRIPE_PAYMENT_LINK_HOST = 'buy.stripe.com';

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUsableSecret(value) {
  const v = String(value ?? '').trim();
  return v.length > 0 && v !== 'REPLACE_ME';
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function flagEnabled(value) {
  return /^(1|true|yes)$/i.test(String(value ?? '').trim());
}

/**
 * Hosted Stripe Payment Links only (https://buy.stripe.com/…).
 * @param {unknown} value
 * @returns {string | null}
 */
export function sanitizeStripePaymentLink(value) {
  const raw = String(value ?? '').trim();
  if (!isUsableSecret(raw)) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname !== STRIPE_PAYMENT_LINK_HOST) return null;
  if (url.username || url.password) return null;
  return url.toString();
}

/**
 * @param {{
 *   enabledFlag?: unknown,
 *   links?: Record<string, unknown>,
 * }} input
 * @returns {{ enabled: boolean, links: Record<string, string> }}
 */
export function publicLessonPayConfig({ enabledFlag, links = {} } = {}) {
  /** @type {Record<string, string>} */
  const sanitized = {};
  for (const id of LESSON_PAY_RATE_IDS) {
    const href = sanitizeStripePaymentLink(links[id]);
    if (href) sanitized[id] = href;
  }

  const enabled = flagEnabled(enabledFlag) && Object.keys(sanitized).length > 0;
  return enabled ? { enabled: true, links: sanitized } : { enabled: false, links: {} };
}

/**
 * Read from Functions environment. Does not log values.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function publicLessonPayConfigFromEnv(env = process.env) {
  return publicLessonPayConfig({
    enabledFlag: env.LESSON_PAYMENTS_ENABLED,
    links: {
      '30min': env.STRIPE_PAYMENT_LINK_30MIN,
      '60min': env.STRIPE_PAYMENT_LINK_60MIN,
    },
  });
}

/**
 * Studio ops may copy Payment Links even when the public book-page flag is off.
 * Still sanitized buy.stripe.com URLs only — never keys.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function studioLessonPayLinksFromEnv(env = process.env) {
  /** @type {Record<string, string>} */
  const links = {};
  const raw = {
    '30min': env.STRIPE_PAYMENT_LINK_30MIN,
    '60min': env.STRIPE_PAYMENT_LINK_60MIN,
  };
  for (const id of LESSON_PAY_RATE_IDS) {
    const href = sanitizeStripePaymentLink(raw[id]);
    if (href) links[id] = href;
  }
  return links;
}
