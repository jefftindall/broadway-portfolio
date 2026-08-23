import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERMISSION,
  ROLE,
  hasPermission,
  isKnownPermission,
  isKnownRole,
  permissionCatalogList,
  resolvePermissions,
  roleCatalogList,
} from './permissions.js';

test('catalog IDs are discrete and stable', () => {
  const ids = permissionCatalogList().map((row) => row.id);
  assert.deepEqual(ids.sort(), [
    PERMISSION.CONTENT_PUBLISH,
    PERMISSION.PEOPLE_READ,
    PERMISSION.PEOPLE_WRITE,
    PERMISSION.USERS_MANAGE,
    PERMISSION.USERS_READ,
  ]);
  assert.equal(isKnownPermission('people.read'), true);
  assert.equal(isKnownPermission('people.delete'), false);
  assert.equal(isKnownRole(ROLE.OWNER), true);
  assert.equal(isKnownRole('superadmin'), false);
});

test('owner role expands to every catalog permission', () => {
  const perms = resolvePermissions({ roles: [ROLE.OWNER] });
  for (const row of permissionCatalogList()) {
    assert.equal(hasPermission(perms, row.id), true, row.id);
  }
});

test('publisher role is publish only', () => {
  const perms = resolvePermissions({ roles: [ROLE.PUBLISHER] });
  assert.deepEqual(perms, [PERMISSION.CONTENT_PUBLISH]);
});

test('people.write implies people.read', () => {
  const fromRole = resolvePermissions({ roles: [ROLE.PEOPLE] });
  assert.equal(hasPermission(fromRole, PERMISSION.PEOPLE_READ), true);
  assert.equal(hasPermission(fromRole, PERMISSION.PEOPLE_WRITE), true);
  assert.equal(hasPermission(fromRole, PERMISSION.CONTENT_PUBLISH), false);

  const extraOnly = resolvePermissions({ extraPermissions: [PERMISSION.PEOPLE_WRITE] });
  assert.equal(hasPermission(extraOnly, PERMISSION.PEOPLE_READ), true);
  assert.equal(hasPermission(extraOnly, PERMISSION.PEOPLE_WRITE), true);
});

test('people_reader cannot write', () => {
  const perms = resolvePermissions({ roles: [ROLE.PEOPLE_READER] });
  assert.deepEqual(perms, [PERMISSION.PEOPLE_READ]);
});

test('extraPermissions grant discrete IDs without a role', () => {
  const perms = resolvePermissions({
    extraPermissions: [PERMISSION.PEOPLE_READ, PERMISSION.CONTENT_PUBLISH],
  });
  assert.deepEqual(perms, [PERMISSION.CONTENT_PUBLISH, PERMISSION.PEOPLE_READ]);
});

test('deniedPermissions win over roles and extras', () => {
  const perms = resolvePermissions({
    roles: [ROLE.OWNER],
    deniedPermissions: [PERMISSION.PEOPLE_WRITE],
  });
  assert.equal(hasPermission(perms, PERMISSION.PEOPLE_WRITE), false);
  assert.equal(hasPermission(perms, PERMISSION.PEOPLE_READ), true);
  assert.equal(hasPermission(perms, PERMISSION.CONTENT_PUBLISH), true);
});

test('unknown roles and permissions are ignored', () => {
  const perms = resolvePermissions({
    roles: [ROLE.PUBLISHER, 'not-a-role'],
    extraPermissions: [PERMISSION.PEOPLE_READ, 'people.delete'],
  });
  assert.deepEqual(perms, [PERMISSION.CONTENT_PUBLISH, PERMISSION.PEOPLE_READ]);
});

test('role catalog lists the permissions each role grants', () => {
  const owner = roleCatalogList().find((row) => row.id === ROLE.OWNER);
  assert.ok(owner.permissions.includes(PERMISSION.USERS_MANAGE));
});
