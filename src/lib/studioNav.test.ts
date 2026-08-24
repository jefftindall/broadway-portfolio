import assert from 'node:assert/strict';
import test from 'node:test';
import { isStudioNavActive, studioHelpHref } from './studioNav.ts';

test('isStudioNavActive treats People as Students and Access as Admin', () => {
  assert.equal(isStudioNavActive('/studio/students', '/studio/people'), true);
  assert.equal(isStudioNavActive('/studio/students', '/studio/people/person'), true);
  assert.equal(isStudioNavActive('/studio/students', '/studio/students/payments'), true);
  assert.equal(isStudioNavActive('/studio/students', '/studio/calendar'), true);
  assert.equal(isStudioNavActive('/studio/admin', '/studio/admin/access'), true);
  assert.equal(isStudioNavActive('/studio/admin', '/studio/admin/calendar'), true);
  assert.equal(isStudioNavActive('/studio/content', '/studio/content'), true);
  assert.equal(isStudioNavActive('/studio/content', '/studio/career'), false);
  assert.equal(isStudioNavActive('/studio/career', '/studio'), false);
});

test('studioHelpHref deep-links by screen', () => {
  assert.equal(studioHelpHref('/studio'), '/studio/help');
  assert.equal(studioHelpHref('/studio/career'), '/studio/help/career');
  assert.equal(studioHelpHref('/studio/content'), '/studio/help/content');
  assert.equal(studioHelpHref('/studio/students'), '/studio/help/students');
  assert.equal(studioHelpHref('/studio/students/payments'), '/studio/help/students');
  assert.equal(studioHelpHref('/studio/people/person'), '/studio/help/students');
  assert.equal(studioHelpHref('/studio/admin'), '/studio/help/admin');
  assert.equal(studioHelpHref('/studio/admin/access'), '/studio/help/access');
  assert.equal(studioHelpHref('/studio/calendar'), '/studio/help/calendar');
  assert.equal(studioHelpHref('/studio/admin/calendar'), '/studio/help/calendar');
  assert.equal(studioHelpHref('/studio/help/content'), '/studio/help');
});
