import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAuthLoginHref,
  buildContactSocialLoginHref,
} from './contactAccounts.ts';

test('buildAuthLoginHref encodes post_login_redirect_uri', () => {
  assert.equal(
    buildAuthLoginHref('contact', '/lessons/book'),
    '/.auth/login/contact?post_login_redirect_uri=%2Flessons%2Fbook',
  );
});

test('buildAuthLoginHref passes domain_hint for generic contact provider only', () => {
  assert.equal(
    buildAuthLoginHref('contact', '/account', { domainHint: 'google' }),
    '/.auth/login/contact?post_login_redirect_uri=%2Faccount&domain_hint=google',
  );
});

test('buildContactSocialLoginHref uses dedicated SWA providers', () => {
  assert.equal(
    buildContactSocialLoginHref('google', '/lessons/book'),
    '/.auth/login/contact-google?post_login_redirect_uri=%2Flessons%2Fbook',
  );
  assert.equal(
    buildContactSocialLoginHref('apple', '/account'),
    '/.auth/login/contact-apple?post_login_redirect_uri=%2Faccount',
  );
  assert.equal(
    buildContactSocialLoginHref('microsoft', '/lessons/book'),
    '/.auth/login/contact-microsoft?post_login_redirect_uri=%2Flessons%2Fbook',
  );
});

test('buildAuthLoginHref does not add domain_hint for workforce AAD', () => {
  assert.equal(
    buildAuthLoginHref('aad', '/studio', { domainHint: 'google' }),
    '/.auth/login/aad?post_login_redirect_uri=%2Fstudio',
  );
});
