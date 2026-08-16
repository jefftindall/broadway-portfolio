import { readRepoTextFile } from './github.js';
import { siteSettingsSchema } from './contentSchemas.js';

export const SITE_SETTINGS_PATH = 'src/data/site-settings.json';

/**
 * Used when the file is not on the content branch yet (e.g. first publish of
 * reel / short bio / press quote / performer facts). In staging PR mode the
 * content branch is today's staging-studio-YYYYMMDD when it exists, else main.
 * TODO(FLEX-P4-004): load seed from src/data/site-settings.json so this cannot drift.
 */
export const DEFAULT_SITE_SETTINGS = siteSettingsSchema.parse({
  reelUrl: 'https://youtu.be/41jdPTkN_Sw',
  reelTitle: 'NYC Cabaret — Stage Kiss reel',
  shortBio:
    'Elyse Tindall is a musical theatre actress and vocal coach from Atlanta, Georgia, now based in New York City.',
  pressQuote: {
    quote: 'The funniest actor you’ve never seen.',
    attribution: 'Tiffany King',
  },
  performer: {
    playingAge: '15–28',
    vocalType: 'Mezzo-Soprano with an extended range',
    vocalRange: 'D3-G6 (Belt: G5)',
    ethnicity:
      'White; olive skin presents as Middle Eastern, Hispanic, Latina, Latin, Italian, Greek, Mediterranean, ethnically ambiguous',
    height: '5\'3" (160 cm)',
    union: 'Non-union',
    availability: 'Available',
  },
});

/**
 * @returns {Promise<import('zod').infer<typeof siteSettingsSchema>>}
 */
export async function readSiteSettings() {
  const raw = await readRepoTextFile(SITE_SETTINGS_PATH);
  if (!raw) {
    return structuredClone(DEFAULT_SITE_SETTINGS);
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
 * @param {Partial<{
 *   reelUrl: string,
 *   reelTitle: string,
 *   shortBio: string,
 *   pressQuote: Partial<{ quote: string, attribution: string }>,
 *   performer: Record<string, string>,
 * }>} patch
 * @returns {Promise<{ path: string, content: string, data: import('zod').infer<typeof siteSettingsSchema> }>}
 */
export async function mergeSiteSettings(patch) {
  const current = await readSiteSettings();
  const next = {
    ...current,
    ...('reelUrl' in patch && patch.reelUrl !== undefined ? { reelUrl: patch.reelUrl } : {}),
    ...('reelTitle' in patch && patch.reelTitle !== undefined ? { reelTitle: patch.reelTitle } : {}),
    ...('shortBio' in patch && patch.shortBio !== undefined ? { shortBio: patch.shortBio } : {}),
    pressQuote:
      patch.pressQuote && typeof patch.pressQuote === 'object'
        ? { ...current.pressQuote, ...patch.pressQuote }
        : current.pressQuote,
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
