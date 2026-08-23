/**
 * Studio payment ledger — Stripe rollups + offline money.
 * Stripe remains the money SoT; this table stores match state and a contact LTV rollup.
 * Never log email, phone, notes, or display names (ids + kinds only).
 */
import { randomUUID } from 'node:crypto';
import { createGeoRedundantTableClient } from './tableGeo.js';
import {
  CrmConfigError,
  CrmNotFoundError,
  CrmValidationError,
  isUsableConnectionString,
  normalizeEmail,
} from './contacts.js';

export const STUDIO_LEDGER_STRIPE_PARTITION = 'stripe';
export const STUDIO_LEDGER_OFFLINE_PARTITION = 'offline';
export const STUDIO_OFFLINE_METHODS = ['venmo', 'cash', 'zelle', 'other'];
export const STUDIO_LEDGER_MATCH_KINDS = [
  'matched',
  'unmatched',
  'ambiguous',
  'needs_student',
];

const MAX_NOTE = 200;
const MAX_EMAIL = 254;

function trimTo(value, max) {
  return String(value || '').trim().slice(0, max);
}

function asIsoDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const text = String(value).trim();
  if (!text) return '';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

function asDay(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function optionalCents(value, { min = 0, max = 2_000_000 } = {}) {
  if (value === '' || value === null || value === undefined) {
    throw new CrmValidationError('Enter a valid amount.');
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new CrmValidationError('Enter a valid amount.');
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) throw new CrmValidationError('Enter a valid amount.');
  return rounded;
}

function isNotFound(err) {
  return err?.statusCode === 404 || /not found|resourcenotfound/i.test(err?.message || '');
}

export function netLedgerCents(row) {
  const amount = Math.max(0, Number(row?.amountCents) || 0);
  const refunded = Math.max(0, Number(row?.refundedCents) || 0);
  return Math.max(0, amount - refunded);
}

export function publicLedgerRow(record) {
  if (!record) return null;
  return {
    id: record.id,
    source: record.source,
    amountCents: Number(record.amountCents) || 0,
    refundedCents: Number(record.refundedCents) || 0,
    netCents: netLedgerCents(record),
    currency: record.currency || 'usd',
    method: record.method || '',
    paidOn: record.paidOn || '',
    note: record.note || '',
    email: record.email || '',
    contactId: record.contactId || '',
    payerContactId: record.payerContactId || '',
    matchKind: record.matchKind || 'unmatched',
    stripePaymentIntentId: record.stripePaymentIntentId || '',
    stripeChargeId: record.stripeChargeId || '',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function entityToRecord(entity) {
  return {
    id: entity.rowKey,
    partitionKey: entity.partitionKey,
    source: String(entity.source || ''),
    email: String(entity.email || ''),
    emailKey: String(entity.emailKey || normalizeEmail(entity.email)),
    amountCents: Number(entity.amountCents || 0),
    refundedCents: Number(entity.refundedCents || 0),
    currency: String(entity.currency || 'usd'),
    method: String(entity.method || ''),
    paidOn: String(entity.paidOn || ''),
    note: String(entity.note || ''),
    contactId: String(entity.contactId || ''),
    payerContactId: String(entity.payerContactId || ''),
    matchKind: String(entity.matchKind || 'unmatched'),
    stripePaymentIntentId: String(entity.stripePaymentIntentId || ''),
    stripeChargeId: String(entity.stripeChargeId || ''),
    stripeSessionId: String(entity.stripeSessionId || ''),
    createdAt: asIsoDate(entity.createdAt) || '',
    updatedAt: asIsoDate(entity.updatedAt) || '',
    etag: entity.etag || entity['odata.etag'] || '',
  };
}

function recordToEntity(record) {
  return {
    partitionKey: record.partitionKey,
    rowKey: record.id,
    source: record.source,
    email: record.email || '',
    emailKey: record.emailKey || normalizeEmail(record.email),
    amountCents: Number(record.amountCents) || 0,
    refundedCents: Number(record.refundedCents) || 0,
    currency: record.currency || 'usd',
    method: record.method || '',
    paidOn: record.paidOn || '',
    note: record.note || '',
    contactId: record.contactId || '',
    payerContactId: record.payerContactId || '',
    matchKind: record.matchKind || 'unmatched',
    stripePaymentIntentId: record.stripePaymentIntentId || '',
    stripeChargeId: record.stripeChargeId || '',
    stripeSessionId: record.stripeSessionId || '',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function resolveLtvTarget(contact) {
  if (!contact) {
    return { matchKind: 'unmatched', contactId: '', payerContactId: '' };
  }
  const personas = Array.isArray(contact.personas) ? contact.personas : [];
  if (personas.includes('student')) {
    return { matchKind: 'matched', contactId: contact.id, payerContactId: contact.id };
  }
  const studentLinks = (contact.relatedContacts || []).filter((rel) => rel.relation === 'student');
  if (studentLinks.length === 1) {
    return { matchKind: 'matched', contactId: studentLinks[0].id, payerContactId: contact.id };
  }
  if (studentLinks.length > 1) {
    return { matchKind: 'ambiguous', contactId: '', payerContactId: contact.id };
  }
  return { matchKind: 'needs_student', contactId: '', payerContactId: contact.id };
}

export function createLedgerStore({ tableClient, contacts }) {
  if (!tableClient) throw new CrmConfigError('missing studio_crm_storage');
  if (!contacts) throw new CrmConfigError('missing studio_crm_storage');

  let tableReady = typeof tableClient.createTable !== 'function';

  async function ensureTable() {
    if (tableReady) return;
    try {
      await tableClient.createTable();
    } catch (err) {
      if (err?.statusCode !== 409 && !/already exists/i.test(err?.message || '')) {
        throw err;
      }
    }
    tableReady = true;
  }

  async function getRecord(partitionKey, id) {
    try {
      const entity = await tableClient.getEntity(partitionKey, id);
      return entityToRecord(entity);
    } catch (err) {
      if (isNotFound(err)) throw new CrmNotFoundError();
      throw err;
    }
  }

  async function writeRecord(record) {
    await ensureTable();
    const entity = recordToEntity(record);
    try {
      await tableClient.updateEntity(entity, 'Replace');
    } catch (err) {
      if (isNotFound(err)) {
        await tableClient.createEntity(entity);
        return;
      }
      throw err;
    }
  }

  async function listPartition(partitionKey) {
    await ensureTable();
    const records = [];
    const iterator = tableClient.listEntities({
      queryOptions: { filter: `PartitionKey eq '${partitionKey}'` },
    });
    for await (const entity of iterator) {
      records.push(entityToRecord(entity));
    }
    return records;
  }

  async function recomputeContact(contactId) {
    const id = String(contactId || '').trim();
    if (!id) return null;
    const [stripe, offline] = await Promise.all([
      listPartition(STUDIO_LEDGER_STRIPE_PARTITION),
      listPartition(STUDIO_LEDGER_OFFLINE_PARTITION),
    ]);
    const stripeCents = stripe
      .filter((row) => row.contactId === id)
      .reduce((sum, row) => sum + netLedgerCents(row), 0);
    const offlineCents = offline
      .filter((row) => row.contactId === id)
      .reduce((sum, row) => sum + netLedgerCents(row), 0);
    return contacts.setLtvRollup(id, {
      stripeCents,
      offlineCents,
      syncedAt: new Date().toISOString(),
    });
  }

  async function matchFromEmail(email) {
    const key = normalizeEmail(email);
    if (!key || typeof contacts.findByEmail !== 'function') {
      return { matchKind: 'unmatched', contactId: '', payerContactId: '' };
    }
    const contact = await contacts.findByEmail(key);
    return resolveLtvTarget(contact);
  }

  return {
    async listForContact(contactId) {
      const id = String(contactId || '').trim();
      const [stripe, offline] = await Promise.all([
        listPartition(STUDIO_LEDGER_STRIPE_PARTITION),
        listPartition(STUDIO_LEDGER_OFFLINE_PARTITION),
      ]);
      const rows = [...stripe, ...offline]
        .filter((row) => row.contactId === id)
        .sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)) || String(b.id).localeCompare(String(a.id)))
        .map(publicLedgerRow);
      return rows;
    },

    async listUnmatched() {
      const stripe = await listPartition(STUDIO_LEDGER_STRIPE_PARTITION);
      return stripe
        .filter((row) => row.matchKind !== 'matched' || !row.contactId)
        .sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)) || String(b.id).localeCompare(String(a.id)))
        .map(publicLedgerRow);
    },

    async upsertStripePayment(input) {
      const src = input && typeof input === 'object' ? input : {};
      const id = String(src.id || '').trim();
      if (!id) throw new CrmValidationError('Missing payment id.');
      const currency = String(src.currency || 'usd').trim().toLowerCase() || 'usd';
      if (currency !== 'usd') {
        return { applied: false, matchKind: 'skipped_currency', paymentId: id };
      }
      const amountCents = optionalCents(src.amountCents, { min: 0 });
      const refundedCents = optionalCents(src.refundedCents ?? 0, { min: 0 });
      const email = trimTo(src.email, MAX_EMAIL);
      const emailKey = normalizeEmail(email);
      let existing = null;
      try {
        existing = await getRecord(STUDIO_LEDGER_STRIPE_PARTITION, id);
      } catch (err) {
        if (!(err instanceof CrmNotFoundError)) throw err;
      }
      const match = emailKey
        ? await matchFromEmail(emailKey)
        : { matchKind: 'unmatched', contactId: '', payerContactId: '' };
      const previousContactId = existing?.contactId || '';
      const now = new Date().toISOString();
      const record = {
        id,
        partitionKey: STUDIO_LEDGER_STRIPE_PARTITION,
        source: 'stripe',
        email,
        emailKey,
        amountCents,
        refundedCents,
        currency,
        method: 'stripe',
        paidOn: asDay(src.paidOn) || (existing?.paidOn || now.slice(0, 10)),
        note: '',
        contactId: match.contactId,
        payerContactId: match.payerContactId,
        matchKind: match.matchKind,
        stripePaymentIntentId: String(src.stripePaymentIntentId || existing?.stripePaymentIntentId || ''),
        stripeChargeId: String(src.stripeChargeId || existing?.stripeChargeId || ''),
        stripeSessionId: String(src.stripeSessionId || existing?.stripeSessionId || ''),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await writeRecord(record);
      const touched = new Set([previousContactId, record.contactId].filter(Boolean));
      for (const contactId of touched) {
        await recomputeContact(contactId);
      }
      return {
        applied: true,
        matchKind: record.matchKind,
        paymentId: record.id,
        contactId: record.contactId || undefined,
      };
    },

    async applyStripeRefund({ id, paymentIntentId, chargeId, refundedCents, email } = {}) {
      const stripe = await listPartition(STUDIO_LEDGER_STRIPE_PARTITION);
      const row =
        stripe.find((item) => id && item.id === id) ||
        stripe.find((item) => paymentIntentId && item.stripePaymentIntentId === paymentIntentId) ||
        stripe.find((item) => chargeId && item.stripeChargeId === chargeId) ||
        stripe.find((item) => chargeId && item.id === chargeId) ||
        stripe.find((item) => paymentIntentId && item.id === paymentIntentId);
      if (!row) {
        if (id || paymentIntentId || chargeId) {
          return this.upsertStripePayment({
            id: id || paymentIntentId || chargeId,
            amountCents: refundedCents,
            refundedCents,
            email,
            stripePaymentIntentId: paymentIntentId,
            stripeChargeId: chargeId,
          });
        }
        return { applied: false, matchKind: 'missing_payment' };
      }
      row.refundedCents = optionalCents(refundedCents ?? row.refundedCents, { min: 0 });
      if (email && !row.email) {
        row.email = trimTo(email, MAX_EMAIL);
        row.emailKey = normalizeEmail(email);
      }
      if (chargeId) row.stripeChargeId = chargeId;
      if (paymentIntentId) row.stripePaymentIntentId = paymentIntentId;
      if (!row.contactId && row.emailKey) {
        const match = await matchFromEmail(row.emailKey);
        row.contactId = match.contactId;
        row.payerContactId = match.payerContactId;
        row.matchKind = match.matchKind;
      }
      row.updatedAt = new Date().toISOString();
      await writeRecord(row);
      if (row.contactId) await recomputeContact(row.contactId);
      return {
        applied: true,
        matchKind: row.matchKind,
        paymentId: row.id,
        contactId: row.contactId || undefined,
      };
    },

    async rematchUnmatchedForEmail(email) {
      const key = normalizeEmail(email);
      if (!key) return { rematched: 0 };
      const stripe = await listPartition(STUDIO_LEDGER_STRIPE_PARTITION);
      const match = await matchFromEmail(key);
      let rematched = 0;
      const touched = new Set();
      for (const row of stripe) {
        if (row.emailKey !== key) continue;
        if (row.matchKind === 'matched' && row.contactId) continue;
        const previous = row.contactId;
        row.contactId = match.contactId;
        row.payerContactId = match.payerContactId;
        row.matchKind = match.matchKind;
        row.updatedAt = new Date().toISOString();
        await writeRecord(row);
        rematched += 1;
        if (previous) touched.add(previous);
        if (row.contactId) touched.add(row.contactId);
      }
      for (const contactId of touched) {
        await recomputeContact(contactId);
      }
      return { rematched };
    },

    async addOfflinePayment(contactId, input) {
      const id = String(contactId || '').trim();
      if (!id) throw new CrmValidationError('Missing person.');
      await contacts.get(id);
      const src = input && typeof input === 'object' ? input : {};
      let amountCents = src.amountCents;
      if (amountCents === undefined && src.amountUsd !== undefined) {
        const usd = Number(src.amountUsd);
        if (!Number.isFinite(usd) || usd <= 0 || usd > 20_000) {
          throw new CrmValidationError('Enter a valid amount.');
        }
        amountCents = Math.round(usd * 100);
      }
      amountCents = optionalCents(amountCents, { min: 1 });
      const method = String(src.method || '')
        .trim()
        .toLowerCase();
      if (!STUDIO_OFFLINE_METHODS.includes(method)) {
        throw new CrmValidationError('Choose Venmo, cash, Zelle, or other.');
      }
      const paidOn = asDay(src.paidOn);
      if (!paidOn) throw new CrmValidationError('Enter the payment date.');
      const now = new Date().toISOString();
      const record = {
        id: randomUUID(),
        partitionKey: STUDIO_LEDGER_OFFLINE_PARTITION,
        source: 'offline',
        email: '',
        emailKey: '',
        amountCents,
        refundedCents: 0,
        currency: 'usd',
        method,
        paidOn,
        note: trimTo(src.note, MAX_NOTE),
        contactId: id,
        payerContactId: id,
        matchKind: 'matched',
        stripePaymentIntentId: '',
        stripeChargeId: '',
        stripeSessionId: '',
        createdAt: now,
        updatedAt: now,
      };
      await ensureTable();
      await tableClient.createEntity(recordToEntity(record));
      await recomputeContact(id);
      return publicLedgerRow(record);
    },

    async removeOfflinePayment(contactId, paymentId) {
      const id = String(contactId || '').trim();
      const rowKey = String(paymentId || '').trim();
      if (!id || !rowKey) throw new CrmValidationError('Missing payment.');
      let row;
      try {
        row = await getRecord(STUDIO_LEDGER_OFFLINE_PARTITION, rowKey);
      } catch (err) {
        if (err instanceof CrmNotFoundError) throw new CrmNotFoundError();
        throw err;
      }
      if (row.contactId !== id || row.source !== 'offline') {
        throw new CrmNotFoundError();
      }
      await tableClient.deleteEntity(STUDIO_LEDGER_OFFLINE_PARTITION, rowKey);
      await recomputeContact(id);
      return { removed: true };
    },

    async assignStripePayment(paymentId, contactId) {
      const rowKey = String(paymentId || '').trim();
      const id = String(contactId || '').trim();
      if (!rowKey || !id) throw new CrmValidationError('Choose a person for this payment.');
      const contact = await contacts.get(id);
      if (!contact.personas?.includes('student')) {
        throw new CrmValidationError('Attach Stripe payments to a student.');
      }
      const row = await getRecord(STUDIO_LEDGER_STRIPE_PARTITION, rowKey);
      const previous = row.contactId;
      row.contactId = id;
      row.payerContactId = row.payerContactId || id;
      row.matchKind = 'matched';
      row.updatedAt = new Date().toISOString();
      await writeRecord(row);
      const touched = new Set([previous, id].filter(Boolean));
      for (const nextId of touched) {
        await recomputeContact(nextId);
      }
      return publicLedgerRow(row);
    },

    recomputeContact,
  };
}

export function ledgerStoreFromEnv(env = process.env, { contacts } = {}) {
  const connectionString = env.STUDIO_CRM_STORAGE_CONNECTION_STRING;
  const tableName = String(env.STUDIO_LEDGER_TABLE_NAME || 'studioLedger').trim() || 'studioLedger';
  if (!isUsableConnectionString(connectionString)) {
    throw new CrmConfigError('missing studio_crm_storage');
  }
  if (!contacts) throw new CrmConfigError('missing studio_crm_storage');
  return createLedgerStore({
    tableClient: createGeoRedundantTableClient(connectionString, tableName),
    contacts,
  });
}

export function tryLedgerStoreFromEnv(env = process.env, deps = {}) {
  try {
    return ledgerStoreFromEnv(env, deps);
  } catch (err) {
    if (err instanceof CrmConfigError) return null;
    throw err;
  }
}
