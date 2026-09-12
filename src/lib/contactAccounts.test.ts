import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAuthLoginHref,
  buildContactSocialLoginHref,
  CONTACT_SOCIAL_IDP_HINTS,
} from './contactAccounts.ts';

test('buildAuthLoginHref encodes post_login_redirect_uri', () => {
  assert.equal(
    buildAuthLoginHref('contact', '/lessons/book'),
    '/.auth/login/contact?post_login_redirect_uri=%2Flessons%2Fbook',
  );
});

test('buildAuthLoginHref passes domain_hint for contact social direct sign-in', () => {
  assert.equal(
    buildAuthLoginHref('contact', '/account', { domainHint: 'google' }),
    '/.auth/login/contact?post_login_redirect_uri=%2Faccount&domain_hint=google',
  );
  assert.equal(
    buildContactSocialLoginHref('apple', '/lessons/book'),
    `/.auth/login/contact?post_login_redirect_uri=%2Flessons%2Fbook&domain_hint=${CONTACT_SOCIAL_IDP_HINTS.apple}`,
  );
});

test('buildAuthLoginHref does not add domain_hint for workforce AAD', () => {
  assert.equal(
    buildAuthLoginHref('aad', '/studio', { domainHint: 'google' }),
    '/.auth/login/aad?post_login_redirect_uri=%2Fstudio',
  );
});
