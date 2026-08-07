/** Default GA4 Measurement ID when PUBLIC_GA_MEASUREMENT_ID is unset or empty. */
export const DEFAULT_GA_MEASUREMENT_ID = 'G-XEE29C0RRE';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Resolve the GA4 Measurement ID from the Astro/Vite public env, falling back
 * to {@link DEFAULT_GA_MEASUREMENT_ID}. Terraform publishes the same value as
 * GitHub Environment variable `GA_MEASUREMENT_ID` for CI builds.
 */
export function getGaMeasurementId(): string {
  const fromEnv = String(import.meta.env.PUBLIC_GA_MEASUREMENT_ID ?? '').trim();
  return fromEnv || DEFAULT_GA_MEASUREMENT_ID;
}

/**
 * Whether to initialize GA on this document. Skips authenticated Studio and
 * pages that emit `noindex` (style-guide, studio help, etc.).
 */
export function shouldLoadGa(pathname: string, noIndex: boolean): boolean {
  if (noIndex) return false;
  if (pathname === '/studio' || pathname.startsWith('/studio/')) return false;
  return true;
}

/** Client-side: read the robots meta written by Seo.astro. */
export function documentRequestsNoIndex(): boolean {
  if (typeof document === 'undefined') return false;
  const robots = document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';
  return /\bnoindex\b/i.test(robots);
}

/** Stable GA4 conversion / engagement events used on the public site. */
export type GaPublicEventName = 'generate_lead' | 'file_download' | 'select_content';

export type GaEventParams = Record<string, string | number | boolean | undefined | null>;

/**
 * Send a GA4 event via gtag. No-ops when GA was not initialized (Studio /
 * noindex) or gtag is unavailable. See docs/plans/search-and-analytics.md
 * (`SEARCH-P1-003`) and docs/runbooks/observability.md for parameter names.
 */
export function trackGaEvent(name: GaPublicEventName | string, params: GaEventParams = {}): void {
  if (typeof window === 'undefined') return;
  const gtag = window.gtag;
  if (typeof gtag !== 'function') return;

  const cleaned: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    cleaned[key] = value;
  }

  gtag('event', name, cleaned);
}
