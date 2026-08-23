#!/usr/bin/env node
/**
 * Idempotent Studio People seed (15 fictional rows = 1.5 pages at 10/page).
 * Deploy / operator script — Azure Functions do not call this.
 *
 * Local: Azurite + STUDIO_CRM_STORAGE_CONNECTION_STRING + STUDIO_CRM_OWNER=dev
 * Staging CD: scripts/seed-studio-people.sh writes a 0600 connection-string file
 * and an owners file (Entra object ids). Never prints names, emails, phones, or keys.
 */
import { readFileSync } from 'node:fs';
import { contactsStoreFromEnv } from '../api/src/lib/contacts.js';
import { ensurePeopleSeed, parseOwnerList, PEOPLE_SEEDS } from './lib/people-seed.mjs';

function readConnectionString() {
  const file = String(process.env.STUDIO_CRM_STORAGE_CONNECTION_STRING_FILE || '').trim();
  if (file) {
    return readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim();
  }
  return String(process.env.STUDIO_CRM_STORAGE_CONNECTION_STRING || '').trim();
}

function readOwners() {
  const file = String(process.env.STUDIO_CRM_OWNERS_FILE || '').trim();
  if (file) {
    return parseOwnerList(readFileSync(file, 'utf8'));
  }
  const fromList = parseOwnerList(process.env.STUDIO_CRM_OWNERS || '');
  if (fromList.length) return fromList;
  const single = String(process.env.STUDIO_CRM_OWNER || process.env.STUDIO_CRM_DEV_OWNER || 'dev').trim();
  return parseOwnerList(single);
}

const connectionString = readConnectionString();
const owners = readOwners();
if (!owners.length) {
  console.error('Studio People seed failed (missing_owners). Set STUDIO_CRM_OWNER or STUDIO_CRM_OWNERS_FILE.');
  process.exitCode = 1;
  process.exit();
}

try {
  const store = contactsStoreFromEnv({
    STUDIO_CRM_STORAGE_CONNECTION_STRING: connectionString,
    STUDIO_CRM_TABLE_NAME: process.env.STUDIO_CRM_TABLE_NAME,
  });
  let created = 0;
  for (const owner of owners) {
    const result = await ensurePeopleSeed(store, owner);
    created += result.created;
  }
  console.log(
    `Studio People seed: owners=${owners.length} created=${created} rows_per_owner=${PEOPLE_SEEDS.length} ids=${PEOPLE_SEEDS.map((row) => row.id).join(',')}`,
  );
} catch (err) {
  const kind = err?.name || 'Error';
  console.error(
    `Studio People seed failed (${kind}). Check storage connection and that the contacts table exists.`,
  );
  process.exitCode = 1;
}
