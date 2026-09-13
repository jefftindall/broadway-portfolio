import assert from 'node:assert/strict';
import test from 'node:test';
import { CrmValidationError } from './contacts.js';
import { normalizeAccountPatch, publicAccountProfile } from './accountProfile.js';

test('normalizeAccountPatch allowlists self-serve fields only', () => {
  const patch = normalizeAccountPatch({
    displayName: 'Ada',
    email: 'ada@example.com',
    phone: '555-0100',
    studentFormat: 'zoom',
    studentSmsOk: true,
    timezone: 'America/Chicago',
    personas: ['parent', 'agent'],
    notes: 'secret',
    studentRateCents: 6000,
  });
  assert.equal(patch.displayName, 'Ada');
  assert.equal(patch.email, 'ada@example.com');
  assert.equal(patch.studentFormat, 'zoom');
  assert.equal(patch.timezone, 'America/Chicago');
  assert.deepEqual(patch.personas, ['parent']);
  assert.equal(patch.notes, undefined);
  assert.equal(patch.studentRateCents, undefined);
});

test('normalizeAccountPatch rejects invalid timezone', () => {
  assert.throws(
    () => normalizeAccountPatch({ timezone: 'Not/AZone' }),
    CrmValidationError,
  );
});

test('publicAccountProfile hides operator fields and flags persona choice', () => {
  const profile = publicAccountProfile({
    id: 'id-1',
    displayName: 'Ada',
    email: 'relay@privaterelay.appleid.com',
    phone: '',
    personas: ['agent'],
    notes: 'private',
    studentRateCents: 6000,
    studentFormat: 'nyc',
    studentSmsOk: false,
    timezone: 'America/New_York',
    etag: 'etag-1',
  });
  assert.equal(profile?.needsPersonaChoice, true);
  assert.equal(profile?.appleRelayEmail, true);
  assert.equal(profile?.notes, undefined);
  assert.equal(profile?.studentRateCents, undefined);
});
