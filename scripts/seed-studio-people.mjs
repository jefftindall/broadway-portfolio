#!/usr/bin/env node
/**
 * Idempotent Studio People seed (15 fictional rows = 1.5 pages at 10/page).
 *
 * Local: AZURE_FUNCTIONS_ENVIRONMENT=Development and Azurite / UseDevelopmentStorage.
 * Staging: STUDIO_CRM_STORAGE_CONNECTION_STRING + STUDIO_CRM_OWNER (signed-in userId).
 *
 * Does not print names, emails, or phones — counts and ids only.
 */
import { contactsStoreFromEnv } from '../api/src/lib/contacts.js';
import { ensurePeopleSeed, PEOPLE_SEEDS } from '../api/src/lib/peopleSeed.js';

const owner = String(process.env.STUDIO_CRM_OWNER || process.env.STUDIO_CRM_DEV_OWNER || 'dev').trim() || 'dev';

try {
  const store = contactsStoreFromEnv();
  const result = await ensurePeopleSeed(store, owner);
  console.log(
    `Studio People seed: created=${result.created} existing_or_skipped=${result.total - result.created} total=${result.total} owner_kind=partition ids=${PEOPLE_SEEDS.map((row) => row.id).join(',')}`,
  );
} catch (err) {
  const kind = err?.name || 'Error';
  console.error(`Studio People seed failed (${kind}). Check STUDIO_CRM_STORAGE_CONNECTION_STRING and that the contacts table exists.`);
  process.exitCode = 1;
}
