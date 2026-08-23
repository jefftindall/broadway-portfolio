#!/usr/bin/env node
/**
 * Upsert Stripe Payment Links for advertised lesson rates and store URLs in
 * the environment Key Vault. Reads the API key from shared KV via Azure CLI
 * (never prints it).
 *
 * Env:
 *   STRIPE_MODE                     test | live
 *   STRIPE_SECRET_VAULT_NAME        vault holding the API key (default kv-elyse-shared)
 *   STRIPE_SECRET_NAME              STRIPE-TEST-SECRET-KEY | STRIPE-LIVE-SECRET-KEY
 *   PAYMENT_LINK_VAULT_NAME         env vault (kv-elyse-staging | kv-elyse-prod)
 *   STRIPE_PRICE_IDS                JSON {"30min":"price_…","60min":"price_…"}
 *   STRIPE_PAYMENT_LINK_SUCCESS_URL
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const requireFromApi = createRequire(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'api', 'package.json'),
);

const RATE_SECRET = {
  '30min': 'STRIPE-PAYMENT-LINK-30MIN',
  '60min': 'STRIPE-PAYMENT-LINK-60MIN',
};

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function azWriteSecretValue(vault, name, outFile) {
  const result = spawnSync(
    'az',
    ['keyvault', 'secret', 'show', '--vault-name', vault, '--name', name, '--query', 'value', '-o', 'tsv'],
    {
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    },
  );
  if (result.status !== 0) {
    fail(`Failed to read ${vault}/${name}`);
  }
  const value = String(result.stdout ?? '').replace(/\r?\n$/, '');
  writeFileSync(outFile, value, { mode: 0o600 });
}

function azSetSecretFromFile(vault, name, filePath) {
  const result = spawnSync(
    'az',
    ['keyvault', 'secret', 'set', '--vault-name', vault, '--name', name, '--file', filePath, '--output', 'none'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'pipe'],
      shell: process.platform === 'win32',
    },
  );
  if (result.status !== 0) {
    fail(`Failed to write ${vault}/${name}`);
  }
}

function loadStripe(apiKey) {
  const Stripe = requireFromApi('stripe');
  return new Stripe(apiKey);
}

function lineItemPriceId(link) {
  const items = link.line_items?.data ?? [];
  return items[0]?.price?.id || items[0]?.price || null;
}

export async function upsertPaymentLinks({
  stripe,
  priceIds,
  successUrl,
  setSecret,
}) {
  const existing = await stripe.paymentLinks.list({
    limit: 100,
    expand: ['data.line_items'],
  });

  const byRate = new Map();
  for (const link of existing.data) {
    const rateId = link.metadata?.lesson_rate_id;
    if (!rateId || !priceIds[rateId]) continue;
    const current = byRate.get(rateId);
    if (!current || (link.active && !current.active)) {
      byRate.set(rateId, link);
    }
  }

  const urls = {};
  for (const [rateId, priceId] of Object.entries(priceIds)) {
    const secretName = RATE_SECRET[rateId];
    if (!secretName) {
      throw new Error(`unsupported lesson rate id ${rateId}`);
    }
    let link = byRate.get(rateId);
    const currentPrice = link ? lineItemPriceId(link) : null;
    if (!link || currentPrice !== priceId || link.active === false) {
      if (link?.active) {
        await stripe.paymentLinks.update(link.id, { active: false });
      }
      link = await stripe.paymentLinks.create({
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { lesson_rate_id: rateId },
        after_completion: {
          type: 'redirect',
          redirect: { url: successUrl },
        },
      });
    }
    urls[rateId] = link.url;
    setSecret(rateId, link.url);
  }
  return urls;
}

async function main() {
  const mode = process.env.STRIPE_MODE;
  if (mode !== 'test' && mode !== 'live') {
    fail('STRIPE_MODE must be test or live');
  }
  const secretVault = process.env.STRIPE_SECRET_VAULT_NAME || 'kv-elyse-shared';
  const secretName = process.env.STRIPE_SECRET_NAME;
  if (!secretName) {
    fail('STRIPE_SECRET_NAME is required');
  }
  const expectedName = mode === 'test' ? 'STRIPE-TEST-SECRET-KEY' : 'STRIPE-LIVE-SECRET-KEY';
  if (secretName !== expectedName) {
    fail(`STRIPE_SECRET_NAME must be ${expectedName} when STRIPE_MODE=${mode}`);
  }
  const linkVault = process.env.PAYMENT_LINK_VAULT_NAME;
  if (!linkVault) {
    fail('PAYMENT_LINK_VAULT_NAME is required');
  }
  const successUrl = process.env.STRIPE_PAYMENT_LINK_SUCCESS_URL;
  if (!successUrl || !successUrl.startsWith('https://')) {
    fail('STRIPE_PAYMENT_LINK_SUCCESS_URL must be https');
  }
  let priceIds;
  try {
    priceIds = JSON.parse(process.env.STRIPE_PRICE_IDS || '');
  } catch {
    fail('STRIPE_PRICE_IDS must be JSON object of rate id → price id');
  }
  if (!priceIds || typeof priceIds !== 'object') {
    fail('STRIPE_PRICE_IDS must be JSON object of rate id → price id');
  }

  const dir = mkdtempSync(join(tmpdir(), 'stripe-pl-'));
  const keyFile = join(dir, 'key');
  try {
    azWriteSecretValue(secretVault, secretName, keyFile);
    const apiKey = readFileSync(keyFile, 'utf8').replace(/[\r\n]/g, '');
    if (!apiKey || apiKey === 'REPLACE_ME') {
      fail(`${secretName} is not populated`);
    }
    const stripe = loadStripe(apiKey);
    await upsertPaymentLinks({
      stripe,
      priceIds,
      successUrl,
      setSecret(rateId, url) {
        const dest = RATE_SECRET[rateId];
        const urlFile = join(dir, rateId);
        writeFileSync(urlFile, url, { mode: 0o600 });
        azSetSecretFromFile(linkVault, dest, urlFile);
        process.stdout.write(`Wrote ${linkVault}/${dest} for ${rateId}.\n`);
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isDirect = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  main().catch((err) => {
    fail(err instanceof Error ? err.message : String(err));
  });
}
