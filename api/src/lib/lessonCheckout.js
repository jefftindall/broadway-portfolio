import Stripe from 'stripe';
import {
  LESSON_PAY_RATE_IDS,
  isUsableSecret,
  lessonCheckoutEnabled,
  parseStripePriceIds,
} from './lessonPayConfig.js';

export class LessonCheckoutValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LessonCheckoutValidationError';
  }
}

export class LessonCheckoutDisabledError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LessonCheckoutDisabledError';
  }
}

export { lessonCheckoutEnabled, parseStripePriceIds };

/**
 * @param {unknown} secretKey
 */
export function stripeCheckoutClient(secretKey) {
  if (!isUsableSecret(secretKey)) {
    throw new LessonCheckoutDisabledError('Stripe is not configured');
  }
  return new Stripe(String(secretKey).trim());
}

/**
 * @param {unknown} siteUrl
 */
export function lessonCheckoutUrls(siteUrl) {
  const base = String(siteUrl ?? '').trim().replace(/\/+$/, '');
  if (!base.startsWith('https://')) {
    throw new LessonCheckoutDisabledError('SITE_URL is not configured');
  }
  return {
    successUrl: `${base}/lessons/book?paid=1`,
    cancelUrl: `${base}/lessons/book`,
  };
}

/**
 * @param {{
 *   rateId: string,
 *   email?: string,
 *   env?: NodeJS.ProcessEnv,
 *   stripe?: import('stripe').default,
 * }} input
 * @returns {Promise<{ sessionId: string, url: string }>}
 */
export async function createLessonCheckoutSession({
  rateId,
  email,
  env = process.env,
  stripe,
}) {
  if (!lessonCheckoutEnabled(env)) {
    throw new LessonCheckoutDisabledError('Lesson checkout is not available');
  }

  const priceIds = parseStripePriceIds(env.STRIPE_PRICE_IDS);
  const normalizedRateId = String(rateId ?? '').trim();
  if (!LESSON_PAY_RATE_IDS.includes(normalizedRateId)) {
    throw new LessonCheckoutValidationError('Invalid lesson rate');
  }
  const price = priceIds[normalizedRateId];
  if (!price) {
    throw new LessonCheckoutValidationError('Invalid lesson rate');
  }

  const client = stripe || stripeCheckoutClient(env.STRIPE_SECRET_KEY);
  const { successUrl, cancelUrl } = lessonCheckoutUrls(env.SITE_URL);

  /** @type {import('stripe').Stripe.Checkout.SessionCreateParams} */
  const sessionParams = {
    mode: 'payment',
    line_items: [{ price, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { lesson_rate_id: normalizedRateId },
  };

  const trimmedEmail = String(email ?? '').trim();
  if (trimmedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    sessionParams.customer_email = trimmedEmail;
  }

  const session = await client.checkout.sessions.create(sessionParams);
  if (!session.url) {
    throw new Error('Stripe checkout session missing url');
  }

  return { sessionId: session.id, url: session.url };
}
