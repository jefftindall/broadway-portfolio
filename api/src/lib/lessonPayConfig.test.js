import assert from 'node:assert/strict';
import test from 'node:test';
import {
  flagEnabled,
  isUsableSecret,
  publicLessonPayConfig,
  publicLessonPayConfigFromEnv,
  sanitizeStripePaymentLink,
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
  assert.deepEqual(result, { enabled: false, links: {} });
});

test('publicLessonPayConfig requires flag plus at least one valid link', () => {
  assert.deepEqual(
    publicLessonPayConfig({
      enabledFlag: 'true',
      links: { '30min': 'REPLACE_ME', '60min': 'REPLACE_ME' },
    }),
    { enabled: false, links: {} },
  );

  assert.deepEqual(
    publicLessonPayConfig({
      enabledFlag: 'true',
      links: {
        '30min': 'https://buy.stripe.com/test_30',
        '60min': 'https://evil.example/phish',
      },
    }),
    { enabled: true, links: { '30min': 'https://buy.stripe.com/test_30' } },
  );
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
  assert.equal('secretKey' in result, false);
  assert.equal(JSON.stringify(result).includes('rk_test'), false);
  assert.equal(JSON.stringify(result).includes('whsec_'), false);
});
