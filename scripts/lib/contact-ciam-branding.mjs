/**
 * CIAM branding theme helpers (ACCOUNT-P1-011).
 * External ID user flows use organizationalBrandingTheme (Graph beta), not company branding.
 */
import fs from 'node:fs';
import path from 'node:path';
import { contactCiamRoot, stableJson } from './contact-ciam-manifest.mjs';

/**
 * @param {Record<string, unknown>} spec
 */
export function normalizeBrandingSpec(spec) {
  return {
    themeName: String(spec.themeName ?? 'Elyse Contact Accounts').trim() || 'Elyse Contact Accounts',
    isDefaultTheme: spec.isDefaultTheme !== false,
    locale: String(spec.locale ?? '0').trim() || '0',
    backgroundColor: String(spec.backgroundColor ?? '').trim(),
    signInPageText: String(spec.signInPageText ?? '').trim(),
    usernameHintText: String(spec.usernameHintText ?? '').trim(),
    bannerLogoFile: String(spec.bannerLogoFile ?? '').trim(),
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
    pageBackgroundColor:
      localization.pageBackgroundColor ?? localization.backgroundColor ?? null,
    backgroundColor: localization.backgroundColor ?? localization.pageBackgroundColor ?? null,
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
    pageBackgroundColor: normalized.backgroundColor,
    backgroundColor: normalized.backgroundColor,
    signInPageText: normalized.signInPageText,
    usernameHintText: normalized.usernameHintText,
  });
}

/**
 * @param {Record<string, unknown>} spec
 * @returns {Record<string, string>}
 */
export function buildBrandingThemeLocalizationPatch(spec) {
  const normalized = normalizeBrandingSpec(spec);
  /** @type {Record<string, string>} */
  const body = {};
  if (normalized.backgroundColor) {
    body.pageBackgroundColor = normalized.backgroundColor;
    body.backgroundColor = normalized.backgroundColor;
  }
  if (normalized.signInPageText) body.signInPageText = normalized.signInPageText;
  if (normalized.usernameHintText) body.usernameHintText = normalized.usernameHintText;
  return body;
}

/**
 * @param {Record<string, unknown> | null | undefined} theme
 * @param {Record<string, unknown>} spec
 * @returns {boolean}
 */
export function brandingThemeMetadataDrift(theme, spec) {
  const normalized = normalizeBrandingSpec(spec);
  if (!theme) return true;
  const remoteName = String(theme.name ?? '').trim();
  const remoteDefault = theme.isDefaultTheme === true;
  return remoteName !== normalized.themeName || remoteDefault !== normalized.isDefaultTheme;
}

/**
 * Resolve banner logo bytes for Graph upload (local file preferred).
 *
 * @param {string} repoRoot
 * @param {Record<string, unknown>} spec
 * @returns {{ bytes: Buffer; contentType: string; source: string } | null}
 */
export function resolveBannerLogoAsset(repoRoot, spec) {
  const normalized = normalizeBrandingSpec(spec);
  if (normalized.bannerLogoFile) {
    const filePath = path.join(contactCiamRoot(repoRoot), 'branding', normalized.bannerLogoFile);
    if (!fs.existsSync(filePath)) {
      throw new Error(`branding banner logo file not found: ${filePath}`);
    }
    const bytes = fs.readFileSync(filePath);
    return {
      bytes,
      contentType: bannerLogoContentType(normalized.bannerLogoFile),
      source: normalized.bannerLogoFile,
    };
  }

  return null;
}

/**
 * @param {string} urlOrFile
 * @returns {string}
 */
export function bannerLogoContentType(urlOrFile) {
  const lower = urlOrFile.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

/**
 * @param {string} url
 * @returns {Promise<{ bytes: Buffer; contentType: string; source: string }>}
 */
export async function fetchBannerLogoFromUrl(url) {
  if (!/^https:\/\//i.test(url)) {
    throw new Error('branding.spec.bannerLogoUrl must be an https URL');
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch banner logo (HTTP ${response.status})`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    bytes,
    contentType: bannerLogoContentType(url),
    source: url,
  };
}
