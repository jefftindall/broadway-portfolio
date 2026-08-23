import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CrmConfigError,
  CrmValidationError,
  MemoryTableClient,
  STUDIO_CONTACTS_PARTITION,
  STUDIO_PERSONAS,
  compareContactsByName,
  contactsStoreFromEnv,
  createContactsStore,
  paginateContacts,
  splitDisplayName,
  isUsableConnectionString,
  normalizeContactInput,
  normalizeEmail,
  publicContact,
} from './contacts.js';
import { classifyCrmError } from './httpErrors.js';

function store() {
  return createContactsStore({ tableClient: new MemoryTableClient() });
}

test('isUsableConnectionString rejects empty and REPLACE_ME', () => {
  assert.equal(isUsableConnectionString(''), false);
  assert.equal(isUsableConnectionString('REPLACE_ME'), false);
  assert.equal(isUsableConnectionString(' UseDevelopmentStorage=true '), true);
});

test('contactsStoreFromEnv requires a real connection string', () => {
  assert.throws(
    () => contactsStoreFromEnv({ STUDIO_CRM_STORAGE_CONNECTION_STRING: 'REPLACE_ME' }),
    CrmConfigError,
  );
});

test('normalizeContactInput requires a name and at least one persona', () => {
  assert.throws(() => normalizeContactInput({ personas: ['student'] }), CrmValidationError);
  assert.throws(
    () => normalizeContactInput({ displayName: 'Ada', personas: ['manager'] }),
    CrmValidationError,
  );
  const ok = normalizeContactInput({
    displayName: '  Ada  ',
    personas: ['student', 'student', 'alumni', 'nope'],
    email: 'ada@example.com',
  });
  assert.equal(ok.displayName, 'Ada');
  assert.deepEqual(ok.personas, ['student', 'alumni']);
  assert.equal(ok.email, 'ada@example.com');
});

test('normalizeContactInput accepts student + agent fields without inventing dollars', () => {
  const ok = normalizeContactInput({
    displayName: 'Kai',
    personas: ['student', 'agent'],
    studentRateUsd: 60,
    studentFormat: 'Zoom',
    studentPackageRemaining: 4,
    studentLastLesson: '2026-08-01',
    agentAgency: 'Example Reps',
    agentTerritory: 'NYC',
    agentLastSubmission: 'Hadestown',
    agentLastBooking: 'Cabaret 2024',
    agentLastBookingYear: 2024,
    agentWarmth: 'Warm',
    agentLastTouch: '2026-08-01',
    agentNextStep: 'Follow up after callback',
  });
  assert.equal(ok.studentRateCents, 6000);
  assert.equal(ok.studentFormat, 'zoom');
  assert.equal(ok.studentPackageRemaining, 4);
  assert.equal(ok.studentLastLesson, '2026-08-01');
  assert.equal(ok.agentAgency, 'Example Reps');
  assert.equal(ok.agentLastBookingYear, 2024);
  assert.equal(ok.agentWarmth, 'warm');
  assert.equal(ok.agentLastTouch, '2026-08-01');
});

test('normalizeContactInput rejects invalid email without echoing it', () => {
  try {
    normalizeContactInput({ displayName: 'Ada', personas: ['student'], email: 'not-an-email' });
    assert.fail('expected validation error');
  } catch (err) {
    assert.equal(err.name, 'CrmValidationError');
    assert.equal(err.message.includes('not-an-email'), false);
  }
});

test('create/list/get/update/archive share one People partition', async () => {
  const table = new MemoryTableClient();
  const crm = createContactsStore({ tableClient: table });
  const created = await crm.create({
    displayName: 'Riley Student',
    email: 'riley@example.com',
    personas: ['student'],
    studentFormat: 'nyc',
  });
  await crm.create({
    displayName: 'Other Operator',
    email: 'other@example.com',
    personas: ['agent'],
  });

  const listed = await crm.list();
  assert.equal(listed.total, 2);
  assert.equal(
    listed.contacts.some((row) => row.id === created.id),
    true,
  );

  const stored = [...table.entities.values()];
  assert.equal(stored.length, 2);
  assert.ok(stored.every((row) => row.partitionKey === STUDIO_CONTACTS_PARTITION));

  const fetched = await crm.get(created.id);
  assert.equal(fetched.displayName, 'Riley Student');
  assert.deepEqual(fetched.personas, ['student']);

  const updated = await crm.update(created.id, {
    notes: 'Prefers morning Zoom makeups.',
    personas: ['student', 'alumni'],
  });
  assert.deepEqual(updated.personas, ['student', 'alumni']);
  assert.equal(updated.notes.includes('Zoom'), true);

  await crm.archive(created.id, true);
  assert.equal((await crm.list()).total, 1);
  assert.equal((await crm.list({ includeArchived: true })).total, 2);
});

test('email uniqueness is per CRM and ignores archived rows', async () => {
  const crm = store();
  await crm.create({
    displayName: 'One',
    email: 'shared@example.com',
    personas: ['student'],
  });
  await assert.rejects(
    () =>
      crm.create({
        displayName: 'Two',
        email: 'SHARED@example.com',
        personas: ['parent'],
      }),
    { name: 'CrmValidationError' },
  );
  const first = (await crm.list()).contacts[0];
  await crm.archive(first.id, true);
  const reused = await crm.create({
    displayName: 'Two',
    email: 'shared@example.com',
    personas: ['casting'],
  });
  assert.equal(reused.email, 'shared@example.com');
});

test('related contacts write both sides and can be a student plus alumni on one row', async () => {
  const crm = store();
  const parent = await crm.create({
    displayName: 'Parent Pat',
    email: 'pat@example.com',
    personas: ['parent'],
  });
  const student = await crm.create({
    displayName: 'Student Sam',
    email: 'sam@example.com',
    personas: ['student', 'alumni'],
    relatedContacts: [{ id: parent.id, relation: 'parent' }],
  });

  const linkedParent = await crm.get(parent.id);
  assert.deepEqual(student.personas, ['student', 'alumni']);
  assert.deepEqual(student.relatedContacts, [{ id: parent.id, relation: 'parent' }]);
  assert.deepEqual(linkedParent.relatedContacts, [{ id: student.id, relation: 'student' }]);

  await crm.update(student.id, { relatedContacts: [] });
  const unlinked = await crm.get(parent.id);
  assert.deepEqual(unlinked.relatedContacts, []);
});

test('search and persona filters do not require a second store', async () => {
  const crm = store();
  await crm.create({
    displayName: 'Jordan Voice',
    email: 'jordan@studio.test',
    personas: ['student'],
  });
  await crm.create({
    displayName: 'Casey Rep',
    email: 'casey@agency.test',
    personas: ['agent'],
  });

  const students = await crm.list({ persona: 'student' });
  assert.equal(students.total, 1);
  assert.equal(students.contacts[0].displayName, 'Jordan Voice');

  const search = await crm.list({ q: 'agency.test' });
  assert.equal(search.total, 1);
  assert.equal(search.contacts[0].personas[0], 'agent');
});

test('default sort is last name then first name', async () => {
  assert.deepEqual(splitDisplayName('Zara Adams'), { firstName: 'Zara', lastName: 'Adams' });
  assert.ok(compareContactsByName({ displayName: 'Zara Adams' }, { displayName: 'Amy Brown' }) < 0);

  const crm = store();
  await crm.create({ displayName: 'Zara Adams', personas: ['student'] });
  await crm.create({ displayName: 'Amy Brown', personas: ['agent'] });
  await crm.create({ displayName: 'Ben Adams', personas: ['parent'] });
  const listed = await crm.list();
  assert.deepEqual(
    listed.contacts.map((row) => row.displayName),
    ['Ben Adams', 'Zara Adams', 'Amy Brown'],
  );
});

test('list paginates 10 per page by default', async () => {
  const crm = store();
  for (const name of [
    'Nia Abel',
    'Omar Bond',
    'Pia Cole',
    'Quin Diaz',
    'Remy Earl',
    'Sage Ford',
    'Tess Gray',
    'Uma Hart',
    'Vera Ives',
    'Wes Jung',
    'Xan Kane',
  ]) {
    await crm.create({ displayName: name, personas: ['student'] });
  }
  const first = await crm.list();
  assert.equal(first.page, 1);
  assert.equal(first.pageSize, 10);
  assert.equal(first.total, 11);
  assert.equal(first.totalPages, 2);
  assert.equal(first.contacts.length, 10);
  assert.equal(first.contacts[0].displayName, 'Nia Abel');

  const second = await crm.list({ page: 2 });
  assert.equal(second.contacts.length, 1);
  assert.equal(second.contacts[0].displayName, 'Xan Kane');

  const directory = await crm.list({ directory: true });
  assert.equal(directory.contacts.length, 11);
  assert.equal(directory.directory, true);

  const page = paginateContacts(new Array(15).fill(0).map((_, i) => ({ id: String(i) })), {
    page: 2,
    pageSize: 10,
  });
  assert.equal(page.contacts.length, 5);
  assert.equal(page.totalPages, 2);
});

test('publicContact never includes a partition key', () => {
  const published = publicContact({
    id: 'x',
    ownerKey: 'secret-user-id',
    partitionKey: 'people',
    displayName: 'Ada',
    email: '',
    phone: '',
    personas: ['casting'],
    notes: '',
    archived: false,
    relatedContacts: [],
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
  });
  assert.equal(published.id, 'x');
  assert.equal(Object.hasOwn(published, 'ownerKey'), false);
  assert.equal(Object.hasOwn(published, 'partitionKey'), false);
});

test('classifyCrmError keeps validation copy and maps config/not-found', () => {
  const validation = classifyCrmError(new CrmValidationError('Enter a name.'));
  assert.equal(validation.status, 400);
  assert.equal(validation.error, 'Enter a name.');

  const missing = classifyCrmError(new CrmConfigError('missing studio_crm_storage'));
  assert.equal(missing.status, 500);
  assert.match(missing.error, /People isn’t configured/i);
  assert.equal(missing.error.includes('studio_crm'), false);

  const gone = classifyCrmError(Object.assign(new Error('not found'), { name: 'CrmNotFoundError' }));
  assert.equal(gone.status, 404);

  const forbidden = classifyCrmError(Object.assign(new Error('nope'), { name: 'CrmForbiddenError' }));
  assert.equal(forbidden.status, 403);
});

test('persona vocabulary stays the planned set', () => {
  assert.deepEqual(STUDIO_PERSONAS, ['student', 'parent', 'agent', 'casting', 'alumni']);
  assert.equal(normalizeEmail('  A@B.C '), 'a@b.c');
});

test('LTV rollup is server-set and findByEmail ignores archived rows', async () => {
  const crm = store();
  const created = await crm.create({
    displayName: 'Ada',
    email: 'ada@example.com',
    personas: ['student'],
  });
  assert.equal(created.studentLtvCents, 0);
  const rolled = await crm.setLtvRollup(created.id, {
    stripeCents: 10000,
    offlineCents: 6000,
    syncedAt: '2026-08-23T00:00:00.000Z',
  });
  assert.equal(rolled.studentLtvCents, 16000);
  assert.equal(rolled.studentLtvStripeCents, 10000);
  assert.equal(rolled.studentLtvOfflineCents, 6000);
  const patched = await crm.update(created.id, { notes: 'Keep LTV' });
  assert.equal(patched.studentLtvCents, 16000);
  assert.equal((await crm.findByEmail('ADA@example.com')).id, created.id);
  await crm.archive(created.id, true);
  assert.equal(await crm.findByEmail('ada@example.com'), null);
});
