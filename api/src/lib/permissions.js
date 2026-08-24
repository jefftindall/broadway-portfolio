/**
 * Studio permission catalog and role bundles.
 *
 * Discrete permission IDs are the authorization unit. Roles are named sets of
 * those IDs. User profiles may also grant `extraPermissions` or subtract
 * `deniedPermissions`. Add a new capability by adding an ID here — do not
 * invent ad-hoc checks in handlers.
 */

export const PERMISSION = {
  CONTENT_PUBLISH: 'content.publish',
  PEOPLE_READ: 'people.read',
  PEOPLE_WRITE: 'people.write',
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  CALENDAR_CONNECT: 'calendar.connect',
  CALENDAR_READ: 'calendar.read',
  CALENDAR_WRITE: 'calendar.write',
};

/** Permission A also grants these IDs (expanded after role + extra union). */
export const PERMISSION_IMPLIES = {
  [PERMISSION.PEOPLE_WRITE]: [PERMISSION.PEOPLE_READ],
  [PERMISSION.USERS_MANAGE]: [PERMISSION.USERS_READ],
  [PERMISSION.CALENDAR_WRITE]: [PERMISSION.CALENDAR_READ],
};

export const PERMISSION_CATALOG = {
  [PERMISSION.CONTENT_PUBLISH]: {
    id: PERMISSION.CONTENT_PUBLISH,
    label: 'Publish site updates',
    description: 'Compose, preview, and publish to the public site.',
  },
  [PERMISSION.PEOPLE_READ]: {
    id: PERMISSION.PEOPLE_READ,
    label: 'View People',
    description: 'Open the People list, contact details, lifetime value, and unmatched payments.',
  },
  [PERMISSION.PEOPLE_WRITE]: {
    id: PERMISSION.PEOPLE_WRITE,
    label: 'Edit People',
    description: 'Create, update, and archive contacts; log offline money; attach unmatched Stripe.',
  },
  [PERMISSION.USERS_READ]: {
    id: PERMISSION.USERS_READ,
    label: 'View access',
    description: 'See Studio roles and assigned permissions.',
  },
  [PERMISSION.USERS_MANAGE]: {
    id: PERMISSION.USERS_MANAGE,
    label: 'Manage access',
    description: 'Assign roles and discrete permissions to Studio users.',
  },
  [PERMISSION.CALENDAR_CONNECT]: {
    id: PERMISSION.CALENDAR_CONNECT,
    label: 'Connect Google Calendar',
    description: 'Connect or disconnect the Studio organizer and Elyse free/busy Google accounts.',
  },
  [PERMISSION.CALENDAR_READ]: {
    id: PERMISSION.CALENDAR_READ,
    label: 'View schedule',
    description: 'Open lesson schedules and free/busy when Calendar is connected.',
  },
  [PERMISSION.CALENDAR_WRITE]: {
    id: PERMISSION.CALENDAR_WRITE,
    label: 'Edit schedule',
    description: 'Create, confirm, decline, reschedule, or cancel lesson requests.',
  },
};

export const ROLE = {
  SUPER_ADMINISTRATOR: 'super_administrator',
  /** @deprecated Stored id `owner` is still accepted; canonical id is `super_administrator`. */
  OWNER: 'super_administrator',
  PUBLISHER: 'publisher',
  PEOPLE: 'people',
  PEOPLE_READER: 'people_reader',
};

/** Historic role ids still present on Table Storage rows. */
export const LEGACY_ROLE_IDS = {
  owner: ROLE.SUPER_ADMINISTRATOR,
};

export function canonicalizeRoleId(id) {
  const raw = String(id || '')
    .trim()
    .toLowerCase();
  return LEGACY_ROLE_IDS[raw] || raw;
}

export const ROLE_CATALOG = {
  [ROLE.SUPER_ADMINISTRATOR]: {
    id: ROLE.SUPER_ADMINISTRATOR,
    label: 'Super Administrator',
    description:
      'Full Studio access, including People and access management. Not an Azure / Entra Owner role.',
    permissions: Object.keys(PERMISSION_CATALOG),
  },
  [ROLE.PUBLISHER]: {
    id: ROLE.PUBLISHER,
    label: 'Publisher',
    description: 'Update the public site. Does not include People.',
    permissions: [PERMISSION.CONTENT_PUBLISH],
  },
  [ROLE.PEOPLE]: {
    id: ROLE.PEOPLE,
    label: 'People',
    description: 'View and edit Studio contacts and lesson schedules.',
    permissions: [
      PERMISSION.PEOPLE_READ,
      PERMISSION.PEOPLE_WRITE,
      PERMISSION.CALENDAR_READ,
      PERMISSION.CALENDAR_WRITE,
    ],
  },
  [ROLE.PEOPLE_READER]: {
    id: ROLE.PEOPLE_READER,
    label: 'People (view only)',
    description: 'View Studio contacts and lesson schedules without changing them.',
    permissions: [PERMISSION.PEOPLE_READ, PERMISSION.CALENDAR_READ],
  },
};

export function isKnownPermission(id) {
  return Object.prototype.hasOwnProperty.call(PERMISSION_CATALOG, String(id || ''));
}

export function isKnownRole(id) {
  return Object.prototype.hasOwnProperty.call(ROLE_CATALOG, canonicalizeRoleId(id));
}

export function permissionCatalogList() {
  return Object.values(PERMISSION_CATALOG);
}

export function roleCatalogList() {
  return Object.values(ROLE_CATALOG).map((role) => ({
    ...role,
    permissions: [...role.permissions],
  }));
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function expandImplied(permissionSet) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...permissionSet]) {
      const implied = PERMISSION_IMPLIES[id] || [];
      for (const extra of implied) {
        if (!permissionSet.has(extra)) {
          permissionSet.add(extra);
          changed = true;
        }
      }
    }
  }
}

/**
 * Resolve effective permission IDs for a profile (or implicit Super Administrator).
 * Unknown role / permission IDs are ignored. Denied IDs win.
 *
 * @param {{ roles?: string[], extraPermissions?: string[], deniedPermissions?: string[] }} grant
 * @returns {string[]}
 */
export function resolvePermissions(grant = {}) {
  const permissionSet = new Set();
  for (const roleId of uniqueStrings(grant.roles).map(canonicalizeRoleId)) {
    const role = ROLE_CATALOG[roleId];
    if (!role) continue;
    for (const id of role.permissions) permissionSet.add(id);
  }
  for (const id of uniqueStrings(grant.extraPermissions)) {
    if (isKnownPermission(id)) permissionSet.add(id);
  }
  expandImplied(permissionSet);
  for (const id of uniqueStrings(grant.deniedPermissions)) {
    permissionSet.delete(id);
  }
  return [...permissionSet].sort();
}

export function hasPermission(permissions, permission) {
  const id = String(permission || '').trim();
  if (!id) return false;
  return Array.isArray(permissions) && permissions.includes(id);
}
