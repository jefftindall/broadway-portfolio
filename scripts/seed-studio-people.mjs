#!/usr/bin/env node
/**
 * Idempotent Studio People seed (15 fictional rows = 1.5 pages at 10/page).
 * Deploy / operator script — Azure Functions do not call this.
 *
 * Local: Azurite + STUDIO_CRM_STORAGE_CONNECTION_STRING
 * Staging CD: scripts/seed-studio-people.sh writes a 0600 connection-string file.
 * Never prints names, emails, phones, or keys.
 */
import { readFileSync } from 'node:fs';
import { contactsStoreFromEnv } from '../api/src/lib/contacts.js';
import { ensurePeopleSeed, PEOPLE_SEEDS } from './lib/people-seed.mjs';

function readConnectionString() {
  const file = String(process.env.STUDIO_CRM_STORAGE_CONNECTION_STRING_FILE || '').trim();
  if (file) {
    return readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim();
  }
  return String(process.env.STUDIO_CRM_STORAGE_CONNECTION_STRING || '').trim();
}

const connectionString = readConnectionString();
if (!connectionString || connectionString === 'REPLACE_ME') {
  console.error(
    'Studio People seed failed (missing_storage). Set STUDIO_CRM_STORAGE_CONNECTION_STRING or STUDIO_CRM_STORAGE_CONNECTION_STRING_FILE.',
  );
  process.exitCode = 1;
  process.exit();
}

try {
  const store = contactsStoreFromEnv({
    STUDIO_CRM_STORAGE_CONNECTION_STRING: connectionString,
    STUDIO_CRM_TABLE_NAME: process.env.STUDIO_CRM_TABLE_NAME,
  });
  const result = await ensurePeopleSeed(store);
  console.log(
    `Studio People seed: created=${result.created} rows=${PEOPLE_SEEDS.length} ids=${PEOPLE_SEEDS.map((row) => row.id).join(',')}`,
  );
} catch (err) {
  const kind = err?.name || 'Error';
  console.error(
    `Studio People seed failed (${kind}). Check storage connection and that the contacts table exists.`,
  );
  process.exitCode = 1;
}
