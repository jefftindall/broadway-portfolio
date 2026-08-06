/** Default GA4 Measurement ID when PUBLIC_GA_MEASUREMENT_ID is unset or empty. */
export const DEFAULT_GA_MEASUREMENT_ID = 'G-XEE29C0RRE';

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
