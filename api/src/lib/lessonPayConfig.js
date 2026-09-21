/**
 * Public lesson-pay config (Payment Links + checkout availability). Never
 * include secret/restricted keys, webhook secrets, or Stripe price ids.
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
/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function parseStripePriceIds(raw) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const id of LESSON_PAY_RATE_IDS) {
    const priceId = String(parsed[id] ?? '').trim();
    if (priceId.startsWith('price_')) out[id] = priceId;
  }
  return out;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function lessonCheckoutEnabled(env = process.env) {
  if (!flagEnabled(env.LESSON_PAYMENTS_ENABLED)) return false;
  if (!isUsableSecret(env.STRIPE_SECRET_KEY)) return false;
  return Object.keys(parseStripePriceIds(env.STRIPE_PRICE_IDS)).length > 0;
}

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
 *   priceIdsRaw?: unknown,
 *   stripeSecretKey?: unknown,
 * }} input
 * @returns {{ enabled: boolean, links: Record<string, string>, checkout: boolean }}
 */
export function publicLessonPayConfig({
  enabledFlag,
  links = {},
  priceIdsRaw,
  stripeSecretKey,
} = {}) {
  /** @type {Record<string, string>} */
  const sanitized = {};
  for (const id of LESSON_PAY_RATE_IDS) {
    const href = sanitizeStripePaymentLink(links[id]);
    if (href) sanitized[id] = href;
  }

  const checkout =
    flagEnabled(enabledFlag) &&
    isUsableSecret(stripeSecretKey) &&
    Object.keys(parseStripePriceIds(priceIdsRaw)).length > 0;
  const hasLinks = Object.keys(sanitized).length > 0;
  const enabled = flagEnabled(enabledFlag) && (hasLinks || checkout);
  if (!enabled) return { enabled: false, links: {}, checkout: false };
  return { enabled: true, links: sanitized, checkout };
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
    priceIdsRaw: env.STRIPE_PRICE_IDS,
    stripeSecretKey: env.STRIPE_SECRET_KEY,
  });
}

/**
 * Studio ops may copy Payment Links even when the public book-page flag is off.
 * Still sanitized buy.stripe.com URLs only — never keys.
 * @param {NodeJS.ProcessEnv} [env]
 */
/**
 * Lesson scheduling (Calendar + lesson rows) ships behind the same SWA flag as
 * public Payment Links. Staging true; prod false until go-live.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function lessonSchedulingEnabledFromEnv(env = process.env) {
  return flagEnabled(env.LESSON_PAYMENTS_ENABLED);
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
