import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertPaymentLinks } from './upsert-stripe-payment-links.mjs';

test('upsertPaymentLinks creates a link per rate and writes the URL', async () => {
  const created = [];
  const written = {};
  const stripe = {
    paymentLinks: {
      async list() {
        return { data: [] };
      },
      async create(params) {
        created.push(params);
        assert.equal(params.line_items.length, 1);
        assert.equal(params.after_completion.type, 'redirect');
        assert.equal('payment_method_types' in params, false);
        return {
          id: `plink_${params.metadata.lesson_rate_id}`,
          url: `https://buy.stripe.com/test_${params.metadata.lesson_rate_id}`,
          active: true,
          metadata: params.metadata,
        };
      },
      async update() {
        throw new Error('update should not run when no existing links');
      },
    },
  };

  const urls = await upsertPaymentLinks({
    stripe,
    priceIds: { '30min': 'price_30', '60min': 'price_60' },
    successUrl: 'https://test.elysetindall.com/lessons/book',
    setSecret(rateId, url) {
      written[rateId] = url;
    },
  });

  assert.equal(created.length, 2);
  assert.equal(urls['30min'], 'https://buy.stripe.com/test_30min');
  assert.equal(written['60min'], 'https://buy.stripe.com/test_60min');
});

test('upsertPaymentLinks keeps an active link when the price already matches', async () => {
  let created = 0;
  const stripe = {
    paymentLinks: {
      async list() {
        return {
          data: [
            {
              id: 'plink_existing',
              url: 'https://buy.stripe.com/test_existing',
              active: true,
              metadata: { lesson_rate_id: '30min' },
              line_items: { data: [{ price: { id: 'price_30' } }] },
            },
          ],
        };
      },
      async create() {
        created += 1;
        return { id: 'plink_new', url: 'https://buy.stripe.com/test_new', active: true };
      },
      async update() {
        throw new Error('should not deactivate a matching link');
      },
    },
  };

  const urls = await upsertPaymentLinks({
    stripe,
    priceIds: { '30min': 'price_30' },
    successUrl: 'https://test.elysetindall.com/lessons/book',
    setSecret() {},
  });

  assert.equal(created, 0);
  assert.equal(urls['30min'], 'https://buy.stripe.com/test_existing');
});
