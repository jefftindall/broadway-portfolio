/**
 * Studio CRM contacts — Table Storage schema, validation, and store.
 * Never log email, phone, notes, or display names (ids + kinds only).
 */
import { randomUUID } from 'node:crypto';
import { createGeoRedundantTableClient } from './tableGeo.js';

export const STUDIO_PERSONAS = ['student', 'parent', 'agent', 'casting', 'alumni'];
export const STUDIO_STUDENT_FORMATS = ['nyc', 'zoom'];
export const STUDIO_RELATED_RELATIONS = ['parent', 'student', 'related'];
export const DEFAULT_PEOPLE_PAGE_SIZE = 10;
export const MAX_PEOPLE_PAGE_SIZE = 50;
export const SEED_CONTACT_ID_PATTERN = /^seed-people-\d{2}$/;

const INVERSE_RELATION = {
  parent: 'student',
  student: 'parent',
  related: 'related',
};

const MAX_NAME = 200;
const MAX_EMAIL = 254;
const MAX_PHONE = 40;
const MAX_NOTES = 8000;
const MAX_AGENT_FIELD = 200;
const MAX_AGENT_LONG = 400;
const MAX_RELATED = 20;

export class CrmValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CrmValidationError';
  }
}

export class CrmNotFoundError extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'CrmNotFoundError';
  }
}

export class CrmConflictError extends Error {
  constructor(message = 'conflict') {
    super(message);
    this.name = 'CrmConflictError';
  }
}

export class CrmConfigError extends Error {
  constructor(message = 'missing studio_crm_storage') {
    super(message);
    this.name = 'CrmConfigError';
  }
}

export function isUsableConnectionString(value) {
  const trimmed = String(value || '').trim();
  return Boolean(trimmed) && trimmed !== 'REPLACE_ME';
}

export function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function trimTo(value, max) {
  return String(value || '').trim().slice(0, max);
}

function asIsoDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const text = String(value).trim();
  if (!text) return '';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

function asDay(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function uniquePersonas(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const persona = String(raw || '')
      .trim()
      .toLowerCase();
    if (!STUDIO_PERSONAS.includes(persona) || seen.has(persona)) continue;
    seen.add(persona);
    out.push(persona);
  }
  return out;
}

function parseJsonArray(raw, fallback = []) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeRelated(list) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const id = String(item?.id || '').trim();
    const relation = String(item?.relation || 'related')
      .trim()
      .toLowerCase();
    if (!id || seen.has(id) || !STUDIO_RELATED_RELATIONS.includes(relation)) continue;
    seen.add(id);
    out.push({ id, relation });
    if (out.length >= MAX_RELATED) break;
  }
  return out;
}

function optionalInt(value, { min = 0, max = 1_000_000 } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new CrmValidationError('Enter a valid number.');
  }
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) {
    throw new CrmValidationError('Enter a valid number.');
  }
  return rounded;
}

/**
 * Validate and normalize a contact write (create or patch).
 * Messages must not interpolate caller-supplied PII.
 * @param {Record<string, unknown>} input
 * @param {{ partial?: boolean }} [opts]
 */
export function normalizeContactInput(input, { partial = false } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const has = (key) => Object.prototype.hasOwnProperty.call(src, key);

  const out = {};

  if (!partial || has('displayName')) {
    const displayName = trimTo(src.displayName, MAX_NAME);
    if (!displayName) throw new CrmValidationError('Enter a name.');
    out.displayName = displayName;
  }

  if (!partial || has('email')) {
    const email = trimTo(src.email, MAX_EMAIL);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new CrmValidationError('Email doesn’t look valid.');
    }
    out.email = email;
  }

  if (!partial || has('phone')) {
    out.phone = trimTo(src.phone, MAX_PHONE);
  }

  if (!partial || has('personas')) {
    const personas = uniquePersonas(src.personas);
    if (!partial && personas.length === 0) {
      throw new CrmValidationError('Choose at least one persona.');
    }
    if (partial && has('personas') && personas.length === 0) {
      throw new CrmValidationError('Choose at least one persona.');
    }
    if (!partial || has('personas')) out.personas = personas;
  }

  if (!partial || has('notes')) {
    out.notes = trimTo(src.notes, MAX_NOTES);
  }

  if (!partial || has('archived')) {
    out.archived = Boolean(src.archived);
  }

  if (!partial || has('studentRateCents') || has('studentRateUsd')) {
    if (has('studentRateCents')) {
      out.studentRateCents = optionalInt(src.studentRateCents, { min: 0, max: 1_000_000 });
    } else if (has('studentRateUsd')) {
      const usd = src.studentRateUsd;
      if (usd === '' || usd === null || usd === undefined) {
        out.studentRateCents = null;
      } else {
        const n = Number(usd);
        if (!Number.isFinite(n) || n < 0 || n > 10_000) {
          throw new CrmValidationError('Enter a valid lesson rate.');
        }
        out.studentRateCents = Math.round(n * 100);
      }
    } else if (!partial) {
      out.studentRateCents = null;
    }
  }

  if (!partial || has('studentFormat')) {
    const format = String(src.studentFormat || '')
      .trim()
      .toLowerCase();
    if (format && !STUDIO_STUDENT_FORMATS.includes(format)) {
      throw new CrmValidationError('Format must be NYC or Zoom.');
    }
    out.studentFormat = format;
  }

  if (!partial || has('studentPackageRemaining')) {
    out.studentPackageRemaining = optionalInt(src.studentPackageRemaining, {
      min: 0,
      max: 500,
    });
  }

  if (!partial || has('studentLastLesson')) {
    out.studentLastLesson = asDay(src.studentLastLesson);
  }

  if (!partial || has('agentAgency')) {
    out.agentAgency = trimTo(src.agentAgency, MAX_AGENT_FIELD);
  }
  if (!partial || has('agentTerritory')) {
    out.agentTerritory = trimTo(src.agentTerritory, MAX_AGENT_FIELD);
  }
  if (!partial || has('agentLastSubmission')) {
    out.agentLastSubmission = trimTo(src.agentLastSubmission, MAX_AGENT_LONG);
  }
  if (!partial || has('agentLastBooking')) {
    out.agentLastBooking = trimTo(src.agentLastBooking, MAX_AGENT_LONG);
  }
  if (!partial || has('agentNextStep')) {
    out.agentNextStep = trimTo(src.agentNextStep, MAX_AGENT_LONG);
  }

  if (!partial || has('relatedContacts')) {
    out.relatedContacts = normalizeRelated(src.relatedContacts);
    if (out.relatedContacts.some((rel) => !rel.id)) {
      throw new CrmValidationError('Related person wasn’t found.');
    }
  }

  return out;
}

export function publicContact(record) {
  if (!record) return null;
  return {
    id: record.id,
    displayName: record.displayName,
    email: record.email,
    phone: record.phone,
    personas: [...(record.personas || [])],
    notes: record.notes,
    archived: Boolean(record.archived),
    studentRateCents: record.studentRateCents ?? null,
    studentFormat: record.studentFormat || '',
    studentPackageRemaining: record.studentPackageRemaining ?? null,
    studentLastLesson: record.studentLastLesson || '',
    agentAgency: record.agentAgency || '',
    agentTerritory: record.agentTerritory || '',
    agentLastSubmission: record.agentLastSubmission || '',
    agentLastBooking: record.agentLastBooking || '',
    agentNextStep: record.agentNextStep || '',
    relatedContacts: (record.relatedContacts || []).map((rel) => ({
      id: rel.id,
      relation: rel.relation,
    })),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    etag: record.etag || '',
  };
}

function entityToRecord(entity) {
  return {
    id: entity.rowKey,
    ownerKey: entity.partitionKey,
    displayName: String(entity.displayName || ''),
    email: String(entity.email || ''),
    phone: String(entity.phone || ''),
    personas: uniquePersonas(parseJsonArray(entity.personasJson)),
    notes: String(entity.notes || ''),
    archived: Boolean(entity.archived),
    studentRateCents:
      entity.studentRateCents === undefined || entity.studentRateCents === null
        ? null
        : Number(entity.studentRateCents),
    studentFormat: String(entity.studentFormat || ''),
    studentPackageRemaining:
      entity.studentPackageRemaining === undefined || entity.studentPackageRemaining === null
        ? null
        : Number(entity.studentPackageRemaining),
    studentLastLesson: String(entity.studentLastLesson || ''),
    agentAgency: String(entity.agentAgency || ''),
    agentTerritory: String(entity.agentTerritory || ''),
    agentLastSubmission: String(entity.agentLastSubmission || ''),
    agentLastBooking: String(entity.agentLastBooking || ''),
    agentNextStep: String(entity.agentNextStep || ''),
    relatedContacts: normalizeRelated(parseJsonArray(entity.relatedContactsJson)),
    createdAt: asIsoDate(entity.createdAt) || '',
    updatedAt: asIsoDate(entity.updatedAt) || '',
    etag: entity.etag || entity['odata.etag'] || '',
  };
}

function recordToEntity(record) {
  const entity = {
    partitionKey: record.ownerKey,
    rowKey: record.id,
    displayName: record.displayName,
    email: record.email,
    emailKey: normalizeEmail(record.email),
    phone: record.phone,
    personasJson: JSON.stringify(record.personas || []),
    notes: record.notes,
    archived: Boolean(record.archived),
    studentFormat: record.studentFormat || '',
    studentLastLesson: record.studentLastLesson || '',
    agentAgency: record.agentAgency || '',
    agentTerritory: record.agentTerritory || '',
    agentLastSubmission: record.agentLastSubmission || '',
    agentLastBooking: record.agentLastBooking || '',
    agentNextStep: record.agentNextStep || '',
    relatedContactsJson: JSON.stringify(record.relatedContacts || []),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  if (record.studentRateCents !== null && record.studentRateCents !== undefined) {
    entity.studentRateCents = record.studentRateCents;
  }
  if (record.studentPackageRemaining !== null && record.studentPackageRemaining !== undefined) {
    entity.studentPackageRemaining = record.studentPackageRemaining;
  }
  return entity;
}

function matchesQuery(record, q) {
  const needle = String(q || '')
    .trim()
    .toLowerCase();
  if (!needle) return true;
  return (
    record.displayName.toLowerCase().includes(needle) ||
    record.email.toLowerCase().includes(needle)
  );
}

function isNotFound(err) {
  return err?.statusCode === 404 || /not found|resourcenotfound/i.test(err?.message || '');
}

/** Last whitespace token is the last name; the rest is the given name. */
export function splitDisplayName(displayName) {
  const parts = String(displayName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

export function compareContactsByName(a, b) {
  const left = splitDisplayName(a?.displayName);
  const right = splitDisplayName(b?.displayName);
  const last = left.lastName.localeCompare(right.lastName, 'en', { sensitivity: 'base' });
  if (last !== 0) return last;
  const first = left.firstName.localeCompare(right.firstName, 'en', { sensitivity: 'base' });
  if (first !== 0) return first;
  const display = String(a?.displayName || '').localeCompare(String(b?.displayName || ''), 'en', {
    sensitivity: 'base',
  });
  if (display !== 0) return display;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

export function parsePeoplePageParams({ page, pageSize } = {}) {
  const rawSize = Number.parseInt(pageSize, 10);
  const size = Number.isFinite(rawSize)
    ? Math.min(MAX_PEOPLE_PAGE_SIZE, Math.max(1, rawSize))
    : DEFAULT_PEOPLE_PAGE_SIZE;
  const rawPage = Number.parseInt(page, 10);
  return { page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1, pageSize: size };
}

export function paginateContacts(contacts, params = {}) {
  const parsed = parsePeoplePageParams(params);
  const total = contacts.length;
  const totalPages = Math.max(1, Math.ceil(total / parsed.pageSize) || 1);
  const page = Math.min(parsed.page, totalPages);
  const start = (page - 1) * parsed.pageSize;
  return {
    contacts: contacts.slice(start, start + parsed.pageSize),
    page,
    pageSize: parsed.pageSize,
    total,
    totalPages,
  };
}

export function createContactsStore({ tableClient }) {
  if (!tableClient) throw new CrmConfigError('missing studio_crm_storage');

  async function getRecord(ownerKey, id) {
    try {
      const entity = await tableClient.getEntity(ownerKey, id);
      return entityToRecord(entity);
    } catch (err) {
      if (isNotFound(err)) throw new CrmNotFoundError();
      throw err;
    }
  }

  async function writeRecord(record, { mode = 'Replace', etag } = {}) {
    const entity = recordToEntity(record);
    if (etag) entity.etag = etag;
    await tableClient.updateEntity(entity, mode);
  }

  async function listOwner(ownerKey) {
    const records = [];
    const iterator = tableClient.listEntities({
      queryOptions: { filter: `PartitionKey eq '${ownerKey.replace(/'/g, "''")}'` },
    });
    for await (const entity of iterator) {
      records.push(entityToRecord(entity));
    }
    return records;
  }

  async function assertUniqueEmail(ownerKey, email, exceptId) {
    const key = normalizeEmail(email);
    if (!key) return;
    const all = await listOwner(ownerKey);
    const clash = all.find(
      (row) => row.id !== exceptId && !row.archived && normalizeEmail(row.email) === key,
    );
    if (clash) {
      throw new CrmValidationError('A person with that email is already in your list.');
    }
  }

  async function assertRelatedExist(ownerKey, related, exceptId) {
    for (const rel of related) {
      if (rel.id === exceptId) {
        throw new CrmValidationError('A person can’t be related to themselves.');
      }
      try {
        await getRecord(ownerKey, rel.id);
      } catch (err) {
        if (err instanceof CrmNotFoundError) {
          throw new CrmValidationError('Related person wasn’t found.');
        }
        throw err;
      }
    }
  }

  async function syncRelatedLinks(ownerKey, contactId, previous, next) {
    const prevMap = new Map((previous || []).map((rel) => [rel.id, rel.relation]));
    const nextMap = new Map((next || []).map((rel) => [rel.id, rel.relation]));

    const removed = [...prevMap.keys()].filter((id) => !nextMap.has(id));
    const changed = [...nextMap.entries()].filter(
      ([id, relation]) => prevMap.get(id) !== relation,
    );

    for (const otherId of removed) {
      let other;
      try {
        other = await getRecord(ownerKey, otherId);
      } catch (err) {
        if (err instanceof CrmNotFoundError) continue;
        throw err;
      }
      other.relatedContacts = (other.relatedContacts || []).filter((rel) => rel.id !== contactId);
      other.updatedAt = new Date().toISOString();
      await writeRecord(other, { mode: 'Replace' });
    }

    for (const [otherId, relation] of changed) {
      const inverse = INVERSE_RELATION[relation] || 'related';
      let other;
      try {
        other = await getRecord(ownerKey, otherId);
      } catch (err) {
        if (err instanceof CrmNotFoundError) {
          throw new CrmValidationError('Related person wasn’t found.');
        }
        throw err;
      }
      const others = (other.relatedContacts || []).filter((rel) => rel.id !== contactId);
      others.push({ id: contactId, relation: inverse });
      other.relatedContacts = normalizeRelated(others);
      other.updatedAt = new Date().toISOString();
      await writeRecord(other, { mode: 'Replace' });
    }
  }

  return {
    async list(
      ownerKey,
      { q = '', persona = '', includeArchived = false, page, pageSize, directory = false } = {},
    ) {
      const personaFilter = String(persona || '')
        .trim()
        .toLowerCase();
      if (personaFilter && !STUDIO_PERSONAS.includes(personaFilter)) {
        throw new CrmValidationError('Unknown persona filter.');
      }
      const records = await listOwner(ownerKey);
      const sorted = records
        .filter((row) => includeArchived || !row.archived)
        .filter((row) => matchesQuery(row, q))
        .filter((row) => !personaFilter || row.personas.includes(personaFilter))
        .sort(compareContactsByName)
        .map(publicContact);
      if (directory) {
        return {
          contacts: sorted,
          page: 1,
          pageSize: sorted.length || DEFAULT_PEOPLE_PAGE_SIZE,
          total: sorted.length,
          totalPages: 1,
          directory: true,
        };
      }
      return paginateContacts(sorted, { page, pageSize });
    },

    async get(ownerKey, id) {
      return publicContact(await getRecord(ownerKey, String(id || '').trim()));
    },

    async create(ownerKey, input) {
      const fields = normalizeContactInput(input, { partial: false });
      await assertUniqueEmail(ownerKey, fields.email);
      await assertRelatedExist(ownerKey, fields.relatedContacts);
      const now = new Date().toISOString();
      const record = {
        id: randomUUID(),
        ownerKey,
        ...fields,
        createdAt: now,
        updatedAt: now,
      };
      await tableClient.createEntity(recordToEntity(record));
      try {
        await syncRelatedLinks(ownerKey, record.id, [], record.relatedContacts);
      } catch (err) {
        try {
          await tableClient.deleteEntity(ownerKey, record.id);
        } catch {
          // Best-effort rollback; ids only in subsequent logs.
        }
        throw err;
      }
      return publicContact(record);
    },

    async update(ownerKey, id, input, { etag } = {}) {
      const contactId = String(id || '').trim();
      const existing = await getRecord(ownerKey, contactId);
      const patch = normalizeContactInput(input, { partial: true });
      const next = {
        ...existing,
        ...patch,
        id: existing.id,
        ownerKey,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      if (Object.prototype.hasOwnProperty.call(patch, 'email')) {
        await assertUniqueEmail(ownerKey, next.email, contactId);
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'relatedContacts')) {
        await assertRelatedExist(ownerKey, next.relatedContacts, contactId);
      }
      try {
        await writeRecord(next, { mode: 'Replace', etag: etag || existing.etag });
      } catch (err) {
        if (err?.statusCode === 412 || /precondition/i.test(err?.message || '')) {
          throw new CrmConflictError();
        }
        throw err;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'relatedContacts')) {
        await syncRelatedLinks(ownerKey, contactId, existing.relatedContacts, next.relatedContacts);
      }
      return publicContact(next);
    },

    async archive(ownerKey, id, archived = true) {
      return this.update(ownerKey, id, { archived: Boolean(archived) });
    },

    async ensureSeed(ownerKey, input) {
      const id = String(input?.id || '').trim();
      if (!SEED_CONTACT_ID_PATTERN.test(id)) {
        throw new CrmValidationError('Invalid seed id.');
      }
      try {
        await getRecord(ownerKey, id);
        return { created: false };
      } catch (err) {
        if (!(err instanceof CrmNotFoundError)) throw err;
      }
      const fields = normalizeContactInput(input, { partial: false });
      try {
        await assertUniqueEmail(ownerKey, fields.email);
      } catch (err) {
        if (err instanceof CrmValidationError) return { created: false };
        throw err;
      }
      const now = new Date().toISOString();
      const record = {
        id,
        ownerKey,
        ...fields,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await tableClient.createEntity(recordToEntity(record));
      } catch (err) {
        if (err?.statusCode === 409) return { created: false };
        throw err;
      }
      return { created: true };
    },
  };
}

export function contactsStoreFromEnv(env = process.env) {
  const connectionString = env.STUDIO_CRM_STORAGE_CONNECTION_STRING;
  const tableName = String(env.STUDIO_CRM_TABLE_NAME || 'contacts').trim() || 'contacts';
  if (!isUsableConnectionString(connectionString)) {
    throw new CrmConfigError('missing studio_crm_storage');
  }
  return createContactsStore({
    tableClient: createGeoRedundantTableClient(connectionString, tableName),
  });
}

/** In-memory TableClient stand-in for unit tests. */
export class MemoryTableClient {
  constructor() {
    this.entities = new Map();
  }

  #key(pk, rk) {
    return `${pk}\t${rk}`;
  }

  async createEntity(entity) {
    const key = this.#key(entity.partitionKey, entity.rowKey);
    if (this.entities.has(key)) {
      const err = new Error('Entity already exists');
      err.statusCode = 409;
      throw err;
    }
    this.entities.set(key, { ...entity, etag: `"${this.entities.size + 1}"` });
  }

  async getEntity(partitionKey, rowKey) {
    const entity = this.entities.get(this.#key(partitionKey, rowKey));
    if (!entity) {
      const err = new Error('NotFound');
      err.statusCode = 404;
      throw err;
    }
    return { ...entity };
  }

  async updateEntity(entity, _mode = 'Replace') {
    const key = this.#key(entity.partitionKey, entity.rowKey);
    const existing = this.entities.get(key);
    if (!existing) {
      const err = new Error('NotFound');
      err.statusCode = 404;
      throw err;
    }
    if (entity.etag && existing.etag && entity.etag !== existing.etag) {
      const err = new Error('Precondition Failed');
      err.statusCode = 412;
      throw err;
    }
    const next = { ...entity, etag: `"${Date.now()}"` };
    this.entities.set(key, next);
  }

  async deleteEntity(partitionKey, rowKey) {
    this.entities.delete(this.#key(partitionKey, rowKey));
  }

  listEntities({ queryOptions } = {}) {
    const filter = queryOptions?.filter || '';
    const pkMatch = /PartitionKey eq '([^']*)'/.exec(filter);
    const rows = [...this.entities.values()].filter((entity) => {
      if (pkMatch && entity.partitionKey !== pkMatch[1]) return false;
      return true;
    });
    return {
      async *[Symbol.asyncIterator]() {
        for (const row of rows) yield { ...row };
      },
    };
  }
}
