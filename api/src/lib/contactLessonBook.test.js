import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTACT_SWA_ROLE } from './authRoles.js';
import { MemoryTableClient, createContactsStore } from './contacts.js';
import {
  CONTACT_BOOK_MAX_PER_24H,
  assertContactBookRateLimit,
  contactBookFeatureDisabled,
  requireContactBooking,
} from './contactLessonBook.js';
import { createLessonsStore } from './lessons.js';

function encodePrincipal(principal) {
  return Buffer.from(JSON.stringify(principal), 'utf8').toString('base64');
}

function requestWithPrincipal(principal) {
  return {
    headers: new Map([['x-ms-client-principal', encodePrincipal(principal)]]),
  };
}

const contactPrincipal = {
  identityProvider: 'contact',
  userId: 'sub-book',
  userDetails: 'booker@example.com',
  userRoles: [CONTACT_SWA_ROLE],
  claims: [
    { typ: 'email', val: 'booker@example.com' },
    { typ: 'name', val: 'Booker Student' },
    { typ: 'iss', val: 'https://ciam.example' },
  ],
};

test('contactBookFeatureDisabled returns 404', () => {
  const res = contactBookFeatureDisabled('corr-1');
  assert.equal(res.status, 404);
  assert.match(res.jsonBody.error, /not available/i);
});

test('requireContactBooking returns 404 when flag is off', async () => {
  const result = await requireContactBooking(
    requestWithPrincipal(contactPrincipal),
    'book',
  );
  assert.ok(result.error);
  assert.equal(result.error.status, 404);
});

test('requireContactBooking returns 401 when unsigned', async () => {
  const prev = process.env.CONTACT_ACCOUNTS_ENABLED;
  process.env.CONTACT_ACCOUNTS_ENABLED = 'true';
  try {
    const result = await requireContactBooking({ headers: new Map() }, 'schedule');
    assert.ok(result.error);
    assert.equal(result.error.status, 401);
  } finally {
    if (prev === undefined) delete process.env.CONTACT_ACCOUNTS_ENABLED;
    else process.env.CONTACT_ACCOUNTS_ENABLED = prev;
  }
});

test('assertContactBookRateLimit rejects after max bookings in 24h', async () => {
  const table = new MemoryTableClient();
  const contacts = createContactsStore({ tableClient: table });
  const contact = await contacts.create({
    displayName: 'Rate Limited',
    email: 'rate@example.com',
    personas: ['student'],
  });
  const lessons = createLessonsStore({ tableClient: table });
  const now = Date.now();
  for (let i = 0; i < CONTACT_BOOK_MAX_PER_24H; i += 1) {
    await lessons.create({
      contactId: contact.id,
      startAt: new Date(now + (i + 2) * 60 * 60 * 1000).toISOString(),
      durationMin: 60,
      format: 'zoom',
      timezone: 'America/New_York',
      status: 'requested',
    });
  }
  await assert.rejects(
    () => assertContactBookRateLimit({ lessons, contactId: contact.id, now }),
    (err) => err.name === 'ContactLessonRateLimitError',
  );
});
