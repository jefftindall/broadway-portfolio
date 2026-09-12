/**
 * CIAM organizational branding helpers (ACCOUNT-P1-011).
 */
import { stableJson } from './contact-ciam-manifest.mjs';

/**
 * @param {Record<string, unknown>} spec
 */
export function normalizeBrandingSpec(spec) {
  return {
    locale: String(spec.locale ?? '0').trim() || '0',
    backgroundColor: String(spec.backgroundColor ?? '').trim(),
    signInPageText: String(spec.signInPageText ?? '').trim(),
    usernameHintText: String(spec.usernameHintText ?? '').trim(),
    bannerLogoUrl: String(spec.bannerLogoUrl ?? '').trim(),
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} localization
 * @returns {string}
 */
export function brandingLocalizationFingerprint(localization) {
  if (!localization) return stableJson({});
  return stableJson({
    backgroundColor: localization.backgroundColor ?? null,
    signInPageText: localization.signInPageText ?? null,
    usernameHintText: localization.usernameHintText ?? null,
  });
}

/**
 * @param {Record<string, unknown>} spec
 * @returns {string}
 */
export function brandingDesiredFingerprint(spec) {
  const normalized = normalizeBrandingSpec(spec);
  return stableJson({
    backgroundColor: normalized.backgroundColor,
    signInPageText: normalized.signInPageText,
    usernameHintText: normalized.usernameHintText,
  });
}

/**
 * @param {Record<string, unknown>} spec
 * @returns {Record<string, string>}
 */
export function buildBrandingLocalizationPatch(spec) {
  const normalized = normalizeBrandingSpec(spec);
  /** @type {Record<string, string>} */
  const body = {};
  if (normalized.backgroundColor) body.backgroundColor = normalized.backgroundColor;
  if (normalized.signInPageText) body.signInPageText = normalized.signInPageText;
  if (normalized.usernameHintText) body.usernameHintText = normalized.usernameHintText;
  return body;
}

/**
 * @param {string} url
 * @returns {string}
 */
export function bannerLogoContentType(url) {
  const lower = url.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}
