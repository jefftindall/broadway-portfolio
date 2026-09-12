import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAuthLoginHref,
  buildContactAuthLoginHref,
  buildContactSocialLoginHref,
} from './contactAccounts.ts';

test('buildAuthLoginHref encodes post_login_redirect_uri', () => {
  assert.equal(
    buildAuthLoginHref('contact', '/lessons/book'),
    '/.auth/login/contact?post_login_redirect_uri=%2Flessons%2Fbook',
  );
});

test('buildContactSocialLoginHref uses generic contact provider without domain_hint', () => {
  assert.equal(
    buildContactSocialLoginHref('google', '/lessons/book'),
    '/.auth/login/contact?post_login_redirect_uri=%2Flessons%2Fbook',
  );
  assert.equal(
    buildContactSocialLoginHref('apple', '/account'),
    '/.auth/login/contact?post_login_redirect_uri=%2Faccount',
  );
  assert.equal(
    buildContactSocialLoginHref('microsoft', '/lessons/book'),
    '/.auth/login/contact?post_login_redirect_uri=%2Flessons%2Fbook',
  );
  assert.equal(buildContactSocialLoginHref('google', '/lessons/book'), buildContactAuthLoginHref('/lessons/book'));
});

test('buildAuthLoginHref does not accept domain hints on workforce AAD', () => {
  assert.equal(buildAuthLoginHref('aad', '/studio'), '/.auth/login/aad?post_login_redirect_uri=%2Fstudio');
});
