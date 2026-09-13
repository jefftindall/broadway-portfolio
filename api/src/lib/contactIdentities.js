/**
 * External ID login keys → People contactId (ACCOUNT-P2-001).
 * Never log email, subject, or issuer values — ids + kinds only.
 */
import { createHash } from 'node:crypto';
import { isUsableConnectionString } from './contacts.js';
import { createGeoRedundantTableClient } from './tableGeo.js';

export const CONTACT_IDENTITIES_PARTITION = 'identity';

export class ContactIdentityConfigError extends Error {
  constructor(message = 'missing contact_identity_storage') {
    super(message);
    this.name = 'ContactIdentityConfigError';
  }
}

export class ContactIdentityConflictError extends Error {
  constructor(message = 'identity conflict') {
    super(message);
    this.name = 'ContactIdentityConflictError';
  }
}

function isNotFound(err) {
  return err?.statusCode === 404 || /not found|resourcenotfound/i.test(err?.message || '');
}

function asIsoDate(value) {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

function identityRowKey({ provider, issuer, subject }) {
  const material = `${provider}\n${issuer}\n${subject}`;
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

function entityToRecord(entity) {
  return {
    id: entity.rowKey,
    provider: String(entity.provider || ''),
    issuer: String(entity.issuer || ''),
    subject: String(entity.subject || ''),
    contactId: String(entity.contactId || ''),
    createdAt: asIsoDate(entity.createdAt) || '',
    updatedAt: asIsoDate(entity.updatedAt) || '',
    etag: entity.etag || entity['odata.etag'] || '',
  };
}

function recordToEntity(record) {
  return {
    partitionKey: CONTACT_IDENTITIES_PARTITION,
    rowKey: record.id,
    provider: record.provider,
    issuer: record.issuer,
    subject: record.subject,
    contactId: record.contactId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function createContactIdentitiesStore({ tableClient }) {
  if (!tableClient) throw new ContactIdentityConfigError('missing contact_identity_storage');

  async function getRecord(id) {
    try {
      const entity = await tableClient.getEntity(CONTACT_IDENTITIES_PARTITION, id);
      return entityToRecord(entity);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  return {
    async findByKey({ provider, issuer, subject }) {
      const id = identityRowKey({ provider, issuer, subject });
      return getRecord(id);
    },

    async listByContactId(contactId) {
      const target = String(contactId || '').trim();
      if (!target) return [];
      const rows = [];
      const iterator = tableClient.listEntities({
        queryOptions: { filter: `PartitionKey eq '${CONTACT_IDENTITIES_PARTITION}'` },
      });
      for await (const entity of iterator) {
        const record = entityToRecord(entity);
        if (record.contactId === target) rows.push(record);
      }
      return rows;
    },

    async attach({ provider, issuer, subject, contactId }) {
      const prov = String(provider || '').trim().toLowerCase();
      const iss = String(issuer || '').trim();
      const sub = String(subject || '').trim();
      const linkedContactId = String(contactId || '').trim();
      if (!prov || !sub || !linkedContactId) {
        throw new ContactIdentityConflictError('identity fields required');
      }
      const id = identityRowKey({ provider: prov, issuer: iss, subject: sub });
      const existing = await getRecord(id);
      const now = new Date().toISOString();
      if (existing) {
        if (existing.contactId !== linkedContactId) {
          throw new ContactIdentityConflictError('identity already linked');
        }
        return existing;
      }
      const record = {
        id,
        provider: prov,
        issuer: iss,
        subject: sub,
        contactId: linkedContactId,
        createdAt: now,
        updatedAt: now,
      };
      await tableClient.createEntity(recordToEntity(record));
      return record;
    },
  };
}

export function contactIdentitiesStoreFromEnv(env = process.env) {
  const connectionString = env.STUDIO_CRM_STORAGE_CONNECTION_STRING;
  const tableName =
    String(env.CONTACT_IDENTITIES_TABLE_NAME || 'contactIdentities').trim() || 'contactIdentities';
  if (!isUsableConnectionString(connectionString)) {
    throw new ContactIdentityConfigError('missing contact_identity_storage');
  }
  return createContactIdentitiesStore({
    tableClient: createGeoRedundantTableClient(connectionString, tableName),
  });
}

export function tryContactIdentitiesStoreFromEnv(env = process.env) {
  try {
    return contactIdentitiesStoreFromEnv(env);
  } catch (err) {
    if (err instanceof ContactIdentityConfigError) return null;
    throw err;
  }
}
