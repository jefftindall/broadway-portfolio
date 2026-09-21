import assert from 'node:assert/strict';
import test from 'node:test';
import {
  flagEnabled,
  isUsableSecret,
  lessonCheckoutEnabled,
  lessonSchedulingEnabledFromEnv,
  parseStripePriceIds,
  publicLessonPayConfig,
  publicLessonPayConfigFromEnv,
  sanitizeStripePaymentLink,
  studioLessonPayLinksFromEnv,
} from './lessonPayConfig.js';

test('isUsableSecret rejects empty and REPLACE_ME', () => {
  assert.equal(isUsableSecret(''), false);
  assert.equal(isUsableSecret('REPLACE_ME'), false);
  assert.equal(isUsableSecret(' rk_test_x '), true);
});

test('flagEnabled accepts true/1/yes', () => {
  assert.equal(flagEnabled('true'), true);
  assert.equal(flagEnabled('TRUE'), true);
  assert.equal(flagEnabled('1'), true);
  assert.equal(flagEnabled('yes'), true);
  assert.equal(flagEnabled('false'), false);
  assert.equal(flagEnabled(''), false);
  assert.equal(flagEnabled(undefined), false);
});

test('sanitizeStripePaymentLink allows only https buy.stripe.com', () => {
  assert.equal(
    sanitizeStripePaymentLink('https://buy.stripe.com/test_abc'),
    'https://buy.stripe.com/test_abc',
  );
  assert.equal(
    sanitizeStripePaymentLink('https://buy.stripe.com/live_abc'),
    'https://buy.stripe.com/live_abc',
  );
  assert.equal(sanitizeStripePaymentLink('REPLACE_ME'), null);
  assert.equal(sanitizeStripePaymentLink('https://example.com/pay'), null);
  assert.equal(sanitizeStripePaymentLink('http://buy.stripe.com/test_abc'), null);
  assert.equal(sanitizeStripePaymentLink('javascript:alert(1)'), null);
});

test('publicLessonPayConfig hides links when the flag is off', () => {
  const result = publicLessonPayConfig({
    enabledFlag: 'false',
    links: {
      '30min': 'https://buy.stripe.com/test_30',
      '60min': 'https://buy.stripe.com/test_60',
    },
  });
  assert.deepEqual(result, { enabled: false, links: {}, checkout: false });
});

test('publicLessonPayConfig requires flag plus at least one valid link', () => {
  assert.deepEqual(
    publicLessonPayConfig({
      enabledFlag: 'true',
      links: { '30min': 'REPLACE_ME', '60min': 'REPLACE_ME' },
    }),
    { enabled: false, links: {}, checkout: false },
  );

  assert.deepEqual(
    publicLessonPayConfig({
      enabledFlag: 'true',
      links: {
        '30min': 'https://buy.stripe.com/test_30',
        '60min': 'https://evil.example/phish',
      },
    }),
    {
      enabled: true,
      links: { '30min': 'https://buy.stripe.com/test_30' },
      checkout: false,
    },
  );
});

test('publicLessonPayConfig enables checkout without payment links', () => {
  assert.deepEqual(
    publicLessonPayConfig({
      enabledFlag: 'true',
      links: { '30min': 'REPLACE_ME', '60min': 'REPLACE_ME' },
      priceIdsRaw: '{"30min":"price_test30","60min":"price_test60"}',
      stripeSecretKey: 'rk_test_example',
    }),
    { enabled: true, links: {}, checkout: true },
  );
});

test('lessonCheckoutEnabled requires flag, secret key, and price ids', () => {
  assert.equal(
    lessonCheckoutEnabled({
      LESSON_PAYMENTS_ENABLED: 'true',
      STRIPE_SECRET_KEY: 'rk_test_x',
      STRIPE_PRICE_IDS: '{"30min":"price_test30"}',
    }),
    true,
  );
  assert.equal(
    lessonCheckoutEnabled({
      LESSON_PAYMENTS_ENABLED: 'false',
      STRIPE_SECRET_KEY: 'rk_test_x',
      STRIPE_PRICE_IDS: '{"30min":"price_test30"}',
    }),
    false,
  );
});

test('parseStripePriceIds ignores invalid entries', () => {
  assert.deepEqual(parseStripePriceIds('{"30min":"price_abc"}'), { '30min': 'price_abc' });
  assert.deepEqual(parseStripePriceIds(''), {});
});

test('publicLessonPayConfigFromEnv never returns secret key fields', () => {
  const result = publicLessonPayConfigFromEnv({
    LESSON_PAYMENTS_ENABLED: 'true',
    STRIPE_SECRET_KEY: 'rk_test_should_never_leak',
    STRIPE_WEBHOOK_SECRET: 'whsec_should_never_leak',
    STRIPE_PAYMENT_LINK_30MIN: 'https://buy.stripe.com/test_30',
    STRIPE_PAYMENT_LINK_60MIN: 'https://buy.stripe.com/test_60',
  });
  assert.equal(result.enabled, true);
  assert.deepEqual(result.links, {
    '30min': 'https://buy.stripe.com/test_30',
    '60min': 'https://buy.stripe.com/test_60',
  });
  assert.equal(result.checkout, false);
  assert.equal('secretKey' in result, false);
  assert.equal(JSON.stringify(result).includes('rk_test'), false);
  assert.equal(JSON.stringify(result).includes('whsec_'), false);
});

test('lessonSchedulingEnabledFromEnv follows LESSON_PAYMENTS_ENABLED only', () => {
  assert.equal(lessonSchedulingEnabledFromEnv({ LESSON_PAYMENTS_ENABLED: 'true' }), true);
  assert.equal(lessonSchedulingEnabledFromEnv({ LESSON_PAYMENTS_ENABLED: 'false' }), false);
  assert.equal(lessonSchedulingEnabledFromEnv({}), false);
});

test('studioLessonPayLinksFromEnv returns sanitized links when the public flag is off', () => {
  const links = studioLessonPayLinksFromEnv({
    LESSON_PAYMENTS_ENABLED: 'false',
    STRIPE_SECRET_KEY: 'rk_test_should_never_leak',
    STRIPE_PAYMENT_LINK_30MIN: 'https://buy.stripe.com/test_30',
    STRIPE_PAYMENT_LINK_60MIN: 'REPLACE_ME',
  });
  assert.deepEqual(links, { '30min': 'https://buy.stripe.com/test_30' });
  assert.equal(JSON.stringify(links).includes('rk_test'), false);
});
