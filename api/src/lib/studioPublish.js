/**
 * Staging Studio publish isolation (Option B):
 * - STUDIO_PUBLISH_MODE=pr → commit to staging-studio-YYYYMMDD + open/update PR → main
 * - STUDIO_PUBLISH_MODE=direct (default) → commit to GITHUB_BRANCH (usually main)
 *
 * Branch dates use UTC. Same calendar day reuses one branch.
 */

export const STAGING_STUDIO_BRANCH_PREFIX = 'staging-studio-';
export const STAGING_STUDIO_BRANCH_MAX_AGE_DAYS = 28;

/**
 * @returns {'pr'|'direct'}
 */
export function studioPublishMode() {
  const raw = String(process.env.STUDIO_PUBLISH_MODE || 'direct').toLowerCase().trim();
  return raw === 'pr' ? 'pr' : 'direct';
}

export function isStudioPrPublishMode() {
  return studioPublishMode() === 'pr';
}

/**
 * @param {Date} [now]
 * @returns {string} e.g. staging-studio-20260809
 */
export function stagingStudioBranchName(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${STAGING_STUDIO_BRANCH_PREFIX}${y}${m}${d}`;
}

/**
 * @param {string} name
 * @returns {number | null} UTC midnight ms for the branch date, or null if not a staging-studio branch
 */
export function parseStagingStudioBranchDate(name) {
  const m = new RegExp(`^${STAGING_STUDIO_BRANCH_PREFIX}(\\d{4})(\\d{2})(\\d{2})$`).exec(
    String(name || ''),
  );
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo - 1, d);
  // Reject impossible calendar dates (e.g. 20260231 → rolls forward)
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  ) {
    return null;
  }
  return ms;
}

/**
 * True when the branch date is strictly older than maxAgeDays before today's UTC date.
 * @param {string} name
 * @param {Date} [now]
 * @param {number} [maxAgeDays]
 */
export function isStagingStudioBranchExpired(
  name,
  now = new Date(),
  maxAgeDays = STAGING_STUDIO_BRANCH_MAX_AGE_DAYS,
) {
  const created = parseStagingStudioBranchDate(name);
  if (created == null) return false;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const cutoff = todayUtc - maxAgeDays * 24 * 60 * 60 * 1000;
  return created < cutoff;
}

/**
 * @param {Date} [now]
 */
export function stagingStudioPrTitle(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `Studio staging ${y}-${m}-${d}`;
}

/**
 * @param {{ branch: string, base: string }} opts
 */
export function stagingStudioPrBody({ branch, base }) {
  return [
    'Studio published content to a **staging-only** branch (not live on production until this PR merges).',
    '',
    `| | |`,
    `| --- | --- |`,
    `| Branch | \`${branch}\` |`,
    `| Base | \`${base}\` |`,
    '',
    '### Test on staging SWA',
    '',
    '1. GitHub → Actions → **Staging branch**',
    `2. Run workflow → select \`${branch}\``,
    '3. Smoke/journeys run against the staging hostname (prod is not updated)',
    '',
    '### Promote to production',
    '',
    `Merge this PR into \`${base}\`. Normal CD then builds once → staging verify → prod.`,
    '',
    'Same-day Studio publishes reuse this branch and update this PR. Branches older than 28 days are deleted daily.',
  ].join('\n');
}
