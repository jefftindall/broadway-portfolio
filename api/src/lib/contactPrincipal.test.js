import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contactDisplayNameFromPrincipal,
  contactEmailFromPrincipal,
  contactIdentityKeyFromPrincipal,
  isAppleRelayEmail,
  isContactPrincipal,
} from './contactPrincipal.js';

test('isContactPrincipal recognizes contact providers only', () => {
  assert.equal(isContactPrincipal({ identityProvider: 'contact' }), true);
  assert.equal(isContactPrincipal({ identityProvider: 'contact-google' }), true);
  assert.equal(isContactPrincipal({ identityProvider: 'aad' }), false);
});

test('contactIdentityKeyFromPrincipal reads issuer and subject claims', () => {
  const key = contactIdentityKeyFromPrincipal({
    identityProvider: 'contact',
    userId: 'sub-1',
    claims: [{ typ: 'iss', val: 'https://ciam.example' }],
  });
  assert.deepEqual(key, {
    provider: 'contact',
    issuer: 'https://ciam.example',
    subject: 'sub-1',
  });
});

test('contactEmailFromPrincipal prefers email claims', () => {
  const email = contactEmailFromPrincipal({
    userDetails: 'name-only',
    claims: [{ typ: 'email', val: 'student@example.com' }],
  });
  assert.equal(email, 'student@example.com');
});

test('contactDisplayNameFromPrincipal falls back to email local part', () => {
  const name = contactDisplayNameFromPrincipal({
    userDetails: 'student@example.com',
    claims: [],
  });
  assert.equal(name, 'student');
});

test('isAppleRelayEmail detects relay addresses', () => {
  assert.equal(isAppleRelayEmail('abc@privaterelay.appleid.com'), true);
  assert.equal(isAppleRelayEmail('student@example.com'), false);
});
