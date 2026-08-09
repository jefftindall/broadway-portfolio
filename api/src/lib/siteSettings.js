import { readRepoTextFile } from './github.js';
import { siteSettingsSchema } from './contentSchemas.js';

export const SITE_SETTINGS_PATH = 'src/data/site-settings.json';

/**
 * @returns {Promise<import('zod').infer<typeof siteSettingsSchema>>}
 */
export async function readSiteSettings() {
  const raw = await readRepoTextFile(SITE_SETTINGS_PATH);
  if (!raw) {
    throw new Error('Site settings file is missing.');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Site settings file is not valid JSON.');
  }
  const result = siteSettingsSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error('Site settings failed validation.');
  }
  return result.data;
}

/**
 * Merge allowlisted top-level patches into site-settings.json.
 * @param {Partial<{ reelUrl: string, shortBio: string, performer: Record<string, string> }>} patch
 * @returns {Promise<{ path: string, content: string, data: import('zod').infer<typeof siteSettingsSchema> }>}
 */
export async function mergeSiteSettings(patch) {
  const current = await readSiteSettings();
  const next = {
    ...current,
    ...('reelUrl' in patch && patch.reelUrl !== undefined ? { reelUrl: patch.reelUrl } : {}),
    ...('shortBio' in patch && patch.shortBio !== undefined ? { shortBio: patch.shortBio } : {}),
    performer:
      patch.performer && typeof patch.performer === 'object'
        ? { ...current.performer, ...patch.performer }
        : current.performer,
  };
  const result = siteSettingsSchema.safeParse(next);
  if (!result.success) {
    throw new Error('Updated site settings are invalid.');
  }
  const content = `${JSON.stringify(result.data, null, 2)}\n`;
  return { path: SITE_SETTINGS_PATH, content, data: result.data };
}
