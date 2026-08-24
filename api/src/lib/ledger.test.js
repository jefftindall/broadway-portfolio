import assert from 'node:assert/strict';
import test from 'node:test';
import { createContactsStore, MemoryTableClient } from './contacts.js';
import {
  STUDIO_LEDGER_OFFLINE_PARTITION,
  STUDIO_LEDGER_STRIPE_PARTITION,
  createLedgerStore,
  netLedgerCents,
  resolveLtvTarget,
} from './ledger.js';

function stores() {
  const table = new MemoryTableClient();
  const contacts = createContactsStore({ tableClient: table });
  const ledger = createLedgerStore({ tableClient: table, contacts });
  return { table, contacts, ledger };
}

test('resolveLtvTarget prefers the student, then a single linked student', () => {
  assert.deepEqual(resolveLtvTarget(null), {
    matchKind: 'unmatched',
    contactId: '',
    payerContactId: '',
  });
  assert.deepEqual(
    resolveLtvTarget({
      id: 's1',
      personas: ['student'],
      relatedContacts: [],
    }),
    { matchKind: 'matched', contactId: 's1', payerContactId: 's1' },
  );
  assert.deepEqual(
    resolveLtvTarget({
      id: 'p1',
      personas: ['parent'],
      relatedContacts: [{ id: 's1', relation: 'student' }],
    }),
    { matchKind: 'matched', contactId: 's1', payerContactId: 'p1' },
  );
  assert.deepEqual(
    resolveLtvTarget({
      id: 'p1',
      personas: ['parent'],
      relatedContacts: [
        { id: 's1', relation: 'student' },
        { id: 's2', relation: 'student' },
      ],
    }),
    { matchKind: 'ambiguous', contactId: '', payerContactId: 'p1' },
  );
  assert.deepEqual(
    resolveLtvTarget({ id: 'a1', personas: ['agent'], relatedContacts: [] }),
    { matchKind: 'needs_student', contactId: '', payerContactId: 'a1' },
  );
});

test('stripe email match increments student LTV and refunds decrease it', async () => {
  const { contacts, ledger } = stores();
  const student = await contacts.create({
    displayName: 'Riley Student',
    email: 'riley@example.com',
    personas: ['student'],
  });

  const first = await ledger.upsertStripePayment({
    id: 'pi_1',
    amountCents: 10000,
    email: 'Riley@example.com',
    paidOn: '2026-08-01',
    stripePaymentIntentId: 'pi_1',
  });
  assert.equal(first.applied, true);
  assert.equal(first.matchKind, 'matched');
  assert.equal(first.contactId, student.id);
  assert.equal((await contacts.get(student.id)).studentLtvCents, 10000);

  const refund = await ledger.applyStripeRefund({
    paymentIntentId: 'pi_1',
    refundedCents: 4000,
  });
  assert.equal(refund.applied, true);
  const afterRefund = await contacts.get(student.id);
  assert.equal(afterRefund.studentLtvCents, 6000);
  assert.equal(afterRefund.studentLtvStripeCents, 6000);
  assert.ok(afterRefund.studentLtvSyncedAt);

  const replay = await ledger.upsertStripePayment({
    id: 'pi_1',
    amountCents: 10000,
    refundedCents: 4000,
    email: 'riley@example.com',
    stripePaymentIntentId: 'pi_1',
  });
  assert.equal(replay.applied, true);
  assert.equal((await contacts.get(student.id)).studentLtvCents, 6000);
});

test('unmatched Stripe rows stay listable until assigned to a student', async () => {
  const { contacts, ledger } = stores();
  await ledger.upsertStripePayment({
    id: 'pi_orphan',
    amountCents: 6000,
    email: 'unknown@example.com',
    paidOn: '2026-08-02',
  });
  const unmatched = await ledger.listUnmatched();
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].matchKind, 'unmatched');
  assert.equal(unmatched[0].email, 'unknown@example.com');
  assert.equal(unmatched[0].amountCents, 6000);

  const student = await contacts.create({
    displayName: 'New Student',
    email: 'unknown@example.com',
    personas: ['student'],
  });
  await ledger.rematchUnmatchedForEmail('unknown@example.com');
  assert.equal((await ledger.listUnmatched()).length, 0);
  assert.equal((await contacts.get(student.id)).studentLtvCents, 6000);
});

test('offline venmo/cash is included in LTV and is never a Stripe row', async () => {
  const { contacts, ledger, table } = stores();
  const student = await contacts.create({
    displayName: 'Cash Student',
    email: 'cash@example.com',
    personas: ['student'],
  });
  const payment = await ledger.addOfflinePayment(student.id, {
    amountUsd: 60,
    method: 'venmo',
    paidOn: '2026-08-03',
    note: 'Makeup lesson',
  });
  assert.equal(payment.source, 'offline');
  assert.equal(payment.method, 'venmo');
  assert.equal(payment.amountCents, 6000);
  assert.equal(payment.netCents, 6000);

  const contact = await contacts.get(student.id);
  assert.equal(contact.studentLtvCents, 6000);
  assert.equal(contact.studentLtvOfflineCents, 6000);
  assert.equal(contact.studentLtvStripeCents, 0);

  const stored = [...table.entities.values()].filter(
    (row) => row.partitionKey === STUDIO_LEDGER_OFFLINE_PARTITION,
  );
  assert.equal(stored.length, 1);
  assert.equal(stored[0].source, 'offline');
  assert.equal(
    [...table.entities.values()].some((row) => row.partitionKey === STUDIO_LEDGER_STRIPE_PARTITION),
    false,
  );

  await ledger.removeOfflinePayment(student.id, payment.id);
  assert.equal((await contacts.get(student.id)).studentLtvCents, 0);
});

test('parent email with one linked student rolls LTV onto the student', async () => {
  const { contacts, ledger } = stores();
  const parent = await contacts.create({
    displayName: 'Parent Pat',
    email: 'pat@example.com',
    personas: ['parent'],
  });
  const student = await contacts.create({
    displayName: 'Kid Kai',
    email: 'kai@example.com',
    personas: ['student'],
    relatedContacts: [{ id: parent.id, relation: 'parent' }],
  });
  const result = await ledger.upsertStripePayment({
    id: 'pi_parent',
    amountCents: 10000,
    email: 'pat@example.com',
  });
  assert.equal(result.matchKind, 'matched');
  assert.equal(result.contactId, student.id);
  assert.equal((await contacts.get(student.id)).studentLtvCents, 10000);
  assert.equal((await contacts.get(parent.id)).studentLtvCents, 0);
});

test('assign rejects a non-student and netLedgerCents never goes negative', async () => {
  assert.equal(netLedgerCents({ amountCents: 1000, refundedCents: 1500 }), 0);
  const { contacts, ledger } = stores();
  const agent = await contacts.create({
    displayName: 'Rep',
    email: 'rep@example.com',
    personas: ['agent'],
  });
  await ledger.upsertStripePayment({
    id: 'pi_agent',
    amountCents: 6000,
    email: 'nobody@example.com',
  });
  await assert.rejects(() => ledger.assignStripePayment('pi_agent', agent.id), {
    name: 'CrmValidationError',
  });
});
