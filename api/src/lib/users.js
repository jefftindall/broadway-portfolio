/**
 * Studio user profiles — roles and discrete permission grants.
 * Identity values (emails, UPNs) are stored for matching and Access UI only.
 * Never log emails, display names, or tokens (ids + kinds only).
 */
import { randomUUID } from 'node:crypto';
import { createGeoRedundantTableClient } from './tableGeo.js';
import { isKnownPermission, isKnownRole, resolvePermissions, ROLE } from './permissions.js';
import { isUsableConnectionString } from './contacts.js';

export const STUDIO_USERS_PARTITION = 'studio';
export const USER_STATUSES = ['active', 'disabled'];

const MAX_IDENTITY = 320;
const MAX_DISPLAY_NAME = 200;
const MAX_ROLES = 20;
const MAX_PERMS = 50;

export class AccessValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AccessValidationError';
  }
}

export class AccessNotFoundError extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'AccessNotFoundError';
  }
}

export class AccessConflictError extends Error {
  constructor(message = 'conflict') {
    super(message);
    this.name = 'AccessConflictError';
  }
}

export class AccessConfigError extends Error {
  constructor(message = 'missing studio_users_storage') {
    super(message);
    this.name = 'AccessConfigError';
  }
}

function trimTo(value, max) {
  return String(value || '').trim().slice(0, max);
}

function uniqueLower(values, max) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const id = String(raw || '')
      .trim()
      .toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id.slice(0, MAX_IDENTITY));
    if (out.length >= max) break;
  }
  return out;
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function looksLikeGuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isNotFound(err) {
  return err?.statusCode === 404 || /not found/i.test(String(err?.message || ''));
}

export function identityFromInput(input = {}) {
  let userId = trimTo(input.userId, MAX_IDENTITY);
  let userDetails = trimTo(input.userDetails, MAX_IDENTITY).toLowerCase();
  const emails = uniqueLower(input.emails, 10);
  const identity = trimTo(input.identity, MAX_IDENTITY).toLowerCase();

  if (identity) {
    if (looksLikeGuid(identity)) {
      if (!userId) userId = identity;
    } else if (looksLikeEmail(identity)) {
      if (!emails.includes(identity)) emails.push(identity);
      if (!userDetails) userDetails = identity;
    } else if (!userDetails) {
      userDetails = identity;
    }
  }

  return { userId, userDetails, emails };
}

function normalizeGrantList(values, { known, label, max }) {
  const out = uniqueLower(values, max);
  for (const id of out) {
    if (!known(id)) {
      throw new AccessValidationError(`Unknown ${label}.`);
    }
  }
  return out;
}

export function normalizeUserInput(input = {}, { partial = false } = {}) {
  const patch = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);

  if (!partial || has('identity') || has('userId') || has('userDetails') || has('emails')) {
    const identity = identityFromInput(input);
    if (!partial && !identity.userId && !identity.userDetails && identity.emails.length === 0) {
      throw new AccessValidationError('Enter an email or user ID.');
    }
    if (has('userId') || has('identity') || !partial) patch.userId = identity.userId;
    if (has('userDetails') || has('identity') || !partial) patch.userDetails = identity.userDetails;
    if (has('emails') || has('identity') || !partial) patch.emails = identity.emails;
  }

  if (!partial || has('displayName')) {
    patch.displayName = trimTo(input.displayName, MAX_DISPLAY_NAME);
  }

  if (!partial || has('roles')) {
    patch.roles = normalizeGrantList(input.roles ?? (partial ? undefined : []), {
      known: isKnownRole,
      label: 'role',
      max: MAX_ROLES,
    });
    if (!partial && patch.roles.length === 0 && !has('extraPermissions')) {
      // Allowed: extra-only grants. Empty roles + empty extra is a viewer profile.
    }
  }

  if (!partial || has('extraPermissions')) {
    patch.extraPermissions = normalizeGrantList(input.extraPermissions ?? (partial ? undefined : []), {
      known: isKnownPermission,
      label: 'permission',
      max: MAX_PERMS,
    });
  }

  if (!partial || has('deniedPermissions')) {
    patch.deniedPermissions = normalizeGrantList(
      input.deniedPermissions ?? (partial ? undefined : []),
      {
        known: isKnownPermission,
        label: 'permission',
        max: MAX_PERMS,
      },
    );
  }

  if (!partial || has('crmOwnerKey')) {
    patch.crmOwnerKey = trimTo(input.crmOwnerKey, MAX_IDENTITY);
  }

  if (!partial || has('status')) {
    const status = String(input.status || 'active')
      .trim()
      .toLowerCase();
    if (!USER_STATUSES.includes(status)) {
      throw new AccessValidationError('Unknown status.');
    }
    patch.status = status;
  }

  return patch;
}

export function publicUser(record) {
  if (!record) return null;
  const roles = Array.isArray(record.roles) ? record.roles : [];
  const extraPermissions = Array.isArray(record.extraPermissions)
    ? record.extraPermissions
    : [];
  const deniedPermissions = Array.isArray(record.deniedPermissions)
    ? record.deniedPermissions
    : [];
  return {
    id: record.id,
    userId: record.userId || '',
    userDetails: record.userDetails || '',
    emails: Array.isArray(record.emails) ? record.emails : [],
    displayName: record.displayName || '',
    roles,
    extraPermissions,
    deniedPermissions,
    crmOwnerKey: record.crmOwnerKey || '',
    status: record.status || 'active',
    permissions: resolvePermissions({ roles, extraPermissions, deniedPermissions }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    etag: record.etag,
  };
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function entityToRecord(entity) {
  return {
    id: entity.rowKey,
    userId: String(entity.userId || ''),
    userDetails: String(entity.userDetails || ''),
    emails: parseJsonArray(entity.emailsJson),
    displayName: String(entity.displayName || ''),
    roles: parseJsonArray(entity.rolesJson),
    extraPermissions: parseJsonArray(entity.extraPermissionsJson),
    deniedPermissions: parseJsonArray(entity.deniedPermissionsJson),
    crmOwnerKey: String(entity.crmOwnerKey || ''),
    status: String(entity.status || 'active'),
    createdAt: String(entity.createdAt || ''),
    updatedAt: String(entity.updatedAt || ''),
    etag: entity.etag,
  };
}

function recordToEntity(record) {
  return {
    partitionKey: STUDIO_USERS_PARTITION,
    rowKey: record.id,
    userId: record.userId || '',
    userDetails: record.userDetails || '',
    emailsJson: JSON.stringify(record.emails || []),
    displayName: record.displayName || '',
    rolesJson: JSON.stringify(record.roles || []),
    extraPermissionsJson: JSON.stringify(record.extraPermissions || []),
    deniedPermissionsJson: JSON.stringify(record.deniedPermissions || []),
    crmOwnerKey: record.crmOwnerKey || '',
    status: record.status || 'active',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function profileMatchesCandidates(record, candidates) {
  const keys = [
    record.userId,
    record.userDetails,
    ...(Array.isArray(record.emails) ? record.emails : []),
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  return candidates.some((candidate) => keys.includes(candidate));
}

export function createUsersStore({ tableClient }) {
  if (!tableClient) throw new AccessConfigError('missing studio_users_storage');

  async function getRecord(id) {
    try {
      const entity = await tableClient.getEntity(STUDIO_USERS_PARTITION, id);
      return entityToRecord(entity);
    } catch (err) {
      if (isNotFound(err)) throw new AccessNotFoundError();
      throw err;
    }
  }

  async function listRecords() {
    const records = [];
    const iterator = tableClient.listEntities({
      queryOptions: { filter: `PartitionKey eq '${STUDIO_USERS_PARTITION}'` },
    });
    for await (const entity of iterator) {
      records.push(entityToRecord(entity));
    }
    return records;
  }

  return {
    async list() {
      const records = await listRecords();
      return records
        .sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))
        .map(publicUser);
    },

    async get(id) {
      return publicUser(await getRecord(String(id || '').trim()));
    },

    async findByPrincipal(_principal, candidates) {
      const keys = Array.isArray(candidates)
        ? candidates.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
        : [];
      if (!keys.length) return null;
      const records = await listRecords();
      const match = records.find((row) => profileMatchesCandidates(row, keys));
      return match ? publicUser(match) : null;
    },

    /**
     * Persist an allowlisted caller as an Owner profile so the table is SoT.
     * Idempotent: returns the existing match when one already exists.
     */
    async ensureOwnerFromAllowlist(input) {
      const candidates = [
        input?.userId,
        input?.userDetails,
        ...(Array.isArray(input?.emails) ? input.emails : []),
      ]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);
      const existing = await this.findByPrincipal(null, candidates);
      if (existing) return existing;
      try {
        return await this.create({
          userId: input?.userId,
          userDetails: input?.userDetails,
          emails: input?.emails,
          roles: [ROLE.OWNER],
          crmOwnerKey: input?.crmOwnerKey || input?.userId || '',
        });
      } catch (err) {
        if (err?.statusCode === 409) {
          return this.findByPrincipal(null, candidates);
        }
        throw err;
      }
    },

    async create(input) {
      const fields = normalizeUserInput(input, { partial: false });
      const now = new Date().toISOString();
      const record = {
        id: randomUUID(),
        ...fields,
        createdAt: now,
        updatedAt: now,
      };
      await tableClient.createEntity(recordToEntity(record));
      return publicUser(record);
    },

    async update(id, input, { etag } = {}) {
      const userId = String(id || '').trim();
      const existing = await getRecord(userId);
      const patch = normalizeUserInput(input, { partial: true });
      const next = {
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      const entity = recordToEntity(next);
      if (etag || existing.etag) entity.etag = etag || existing.etag;
      try {
        await tableClient.updateEntity(entity, 'Replace');
      } catch (err) {
        if (err?.statusCode === 412 || /precondition/i.test(err?.message || '')) {
          throw new AccessConflictError(
            'Someone else updated this access record. Refresh and try again.',
          );
        }
        throw err;
      }
      return publicUser({ ...next, etag: entity.etag });
    },
  };
}

export function usersStoreFromEnv(env = process.env) {
  const connectionString = env.STUDIO_CRM_STORAGE_CONNECTION_STRING;
  const tableName = String(env.STUDIO_USERS_TABLE_NAME || 'studioUsers').trim() || 'studioUsers';
  if (!isUsableConnectionString(connectionString)) {
    throw new AccessConfigError('missing studio_users_storage');
  }
  return createUsersStore({
    tableClient: createGeoRedundantTableClient(connectionString, tableName),
  });
}

export function tryUsersStoreFromEnv(env = process.env) {
  try {
    return usersStoreFromEnv(env);
  } catch (err) {
    if (err instanceof AccessConfigError) return null;
    throw err;
  }
}
