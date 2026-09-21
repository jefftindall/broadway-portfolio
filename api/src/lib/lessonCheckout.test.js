import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LessonCheckoutDisabledError,
  createLessonCheckoutSession,
  lessonCheckoutUrls,
  parseStripePriceIds,
} from './lessonCheckout.js';

test('parseStripePriceIds keeps only price_ ids for known rates', () => {
  assert.deepEqual(
    parseStripePriceIds('{"30min":"price_test30","60min":"not_a_price","extra":"price_x"}'),
    { '30min': 'price_test30' },
  );
  assert.deepEqual(parseStripePriceIds('not-json'), {});
});

test('lessonCheckoutUrls builds https success and cancel paths', () => {
  assert.deepEqual(lessonCheckoutUrls('https://test.elysetindall.com/'), {
    successUrl: 'https://test.elysetindall.com/lessons/book?paid=1',
    cancelUrl: 'https://test.elysetindall.com/lessons/book',
  });
});

test('lessonCheckoutUrls rejects missing SITE_URL', () => {
  assert.throws(() => lessonCheckoutUrls(''), LessonCheckoutDisabledError);
});

test('createLessonCheckoutSession creates a hosted checkout session', async () => {
  const calls = [];
  const stripe = {
    checkout: {
      sessions: {
        create: async (params) => {
          calls.push(params);
          return { id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/cs_test_123' };
        },
      },
    },
  };

  const result = await createLessonCheckoutSession({
    rateId: '60min',
    email: 'student@example.com',
    env: {
      LESSON_PAYMENTS_ENABLED: 'true',
      STRIPE_SECRET_KEY: 'rk_test_example',
      STRIPE_PRICE_IDS: '{"30min":"price_30","60min":"price_60"}',
      SITE_URL: 'https://test.elysetindall.com',
    },
    stripe,
  });

  assert.equal(result.url, 'https://checkout.stripe.com/c/pay/cs_test_123');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mode, 'payment');
  assert.deepEqual(calls[0].line_items, [{ price: 'price_60', quantity: 1 }]);
  assert.equal(calls[0].customer_email, 'student@example.com');
  assert.equal(calls[0].metadata.lesson_rate_id, '60min');
  assert.equal(calls[0].payment_method_types, undefined);
});

test('createLessonCheckoutSession rejects unknown rate ids', async () => {
  await assert.rejects(
    () =>
      createLessonCheckoutSession({
        rateId: '90min',
        env: {
          LESSON_PAYMENTS_ENABLED: 'true',
          STRIPE_SECRET_KEY: 'rk_test_example',
          STRIPE_PRICE_IDS: '{"30min":"price_30","60min":"price_60"}',
          SITE_URL: 'https://test.elysetindall.com',
        },
        stripe: { checkout: { sessions: { create: async () => ({}) } } },
      }),
    /Invalid lesson rate/,
  );
});
