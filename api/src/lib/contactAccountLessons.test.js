import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryTableClient, createContactsStore } from './contacts.js';
import { createLessonsStore } from './lessons.js';
import {
  ContactBookTargetError,
  accountLessonStatusLabel,
  listAccountLessons,
  publicAccountLesson,
  resolveBookTargetContact,
} from './contactAccountLessons.js';

function stores() {
  const table = new MemoryTableClient();
  return {
    contacts: createContactsStore({ tableClient: table }),
    lessons: createLessonsStore({ tableClient: table }),
  };
}

test('accountLessonStatusLabel matches Studio labels', () => {
  assert.equal(accountLessonStatusLabel('requested'), 'Requested');
  assert.equal(accountLessonStatusLabel('confirmed'), 'Confirmed');
  assert.equal(accountLessonStatusLabel('declined'), 'Declined');
  assert.equal(accountLessonStatusLabel('cancelled'), 'Cancelled');
});

test('publicAccountLesson omits operator fields', () => {
  const row = publicAccountLesson({
    id: 'l1',
    contactId: 'c1',
    startAt: '2026-06-10T14:00:00.000Z',
    endAt: '2026-06-10T15:00:00.000Z',
    durationMin: 60,
    format: 'zoom',
    timezone: 'America/New_York',
    status: 'requested',
    googleEventId: 'secret',
    notes: 'operator-only',
  });
  assert.equal(row.id, 'l1');
  assert.equal(row.statusLabel, 'Requested');
  assert.equal(row.googleEventId, undefined);
  assert.equal(row.notes, undefined);
});

test('resolveBookTargetContact rejects arbitrary student ids', async () => {
  const { contacts } = stores();
  const parent = await contacts.create({
    displayName: 'Parent',
    email: 'parent@example.com',
    personas: ['parent'],
  });
  const student = await contacts.create({
    displayName: 'Student',
    email: 'student@example.com',
    personas: ['student'],
  });
  await assert.rejects(
    () =>
      resolveBookTargetContact({
        booker: parent,
        body: { bookForContactId: student.id },
        contactsStore: contacts,
      }),
    ContactBookTargetError,
  );
});

test('resolveBookTargetContact allows linked students for parents', async () => {
  const { contacts } = stores();
  const parent = await contacts.create({
    displayName: 'Parent',
    email: 'parent@example.com',
    personas: ['parent'],
    relatedContacts: [],
  });
  const student = await contacts.create({
    displayName: 'Student',
    email: 'student@example.com',
    personas: ['student'],
    relatedContacts: [{ id: parent.id, relation: 'parent' }],
  });
  await contacts.update(parent.id, {
    relatedContacts: [{ id: student.id, relation: 'student' }],
  });
  const parentRow = await contacts.get(parent.id);
  const target = await resolveBookTargetContact({
    booker: parentRow,
    body: { bookForContactId: student.id },
    contactsStore: contacts,
  });
  assert.equal(target.contactId, student.id);
  assert.equal(target.bookedByParent, true);
});

test('listAccountLessons scopes to self and linked students only', async () => {
  const { contacts, lessons } = stores();
  const parent = await contacts.create({
    displayName: 'Parent',
    email: 'parent@example.com',
    personas: ['parent'],
  });
  const student = await contacts.create({
    displayName: 'Student',
    email: 'student@example.com',
    personas: ['student'],
    relatedContacts: [{ id: parent.id, relation: 'parent' }],
  });
  const other = await contacts.create({
    displayName: 'Other',
    email: 'other@example.com',
    personas: ['student'],
  });
  await contacts.update(parent.id, {
    relatedContacts: [{ id: student.id, relation: 'student' }],
  });
  const parentRow = await contacts.get(parent.id);

  const now = Date.parse('2026-06-01T12:00:00.000Z');
  await lessons.create({
    contactId: student.id,
    startAt: '2026-06-10T14:00:00.000Z',
    durationMin: 60,
    format: 'zoom',
    timezone: 'America/New_York',
  });
  await lessons.create({
    contactId: other.id,
    startAt: '2026-06-11T14:00:00.000Z',
    durationMin: 60,
    format: 'zoom',
    timezone: 'America/New_York',
  });

  const history = await listAccountLessons({
    contact: parentRow,
    lessons,
    contactsStore: contacts,
    now,
  });
  assert.equal(history.upcoming.length, 1);
  assert.equal(history.upcoming[0].studentName, 'Student');
  assert.equal(history.past.length, 0);
});
