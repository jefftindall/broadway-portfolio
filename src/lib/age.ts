/**
 * Chronological age from SITE_DATE_OF_BIRTH (Key Vault / local .env).
 * Never render the date itself on public pages.
 */

function dateOfBirth(): string {
  const value = String(
    process.env.SITE_DATE_OF_BIRTH ?? import.meta.env.SITE_DATE_OF_BIRTH ?? '',
  ).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(
      'SITE_DATE_OF_BIRTH must be set to YYYY-MM-DD (Key Vault SITE-DATE-OF-BIRTH or local .env).',
    );
  }
  return value;
}

/** Chronological age in whole years as of `asOf` (defaults to now). */
export function ageInYears(asOf: Date = new Date()): number {
  const [year, month, day] = dateOfBirth().split('-').map(Number);
  let age = asOf.getFullYear() - year;
  const monthIndex = month - 1;
  const beforeBirthday =
    asOf.getMonth() < monthIndex ||
    (asOf.getMonth() === monthIndex && asOf.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}
