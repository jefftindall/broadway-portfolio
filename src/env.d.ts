/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly SITE_CONTACT_EMAIL?: string;
  readonly SITE_CONTACT_PHONE?: string;
  readonly SITE_DATE_OF_BIRTH?: string;
  readonly PUBLIC_APPINSIGHTS_CONNECTION_STRING?: string;
  readonly PUBLIC_APPINSIGHTS_SAMPLE_PERCENT?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  /** GA4 Measurement ID (public). Defaults to G-XEE29C0RRE when unset. */
  readonly PUBLIC_GA_MEASUREMENT_ID?: string;
  /** Local-only pay-flow flag. Staging/prod use SWA `LESSON_PAYMENTS_ENABLED`. */
  readonly PUBLIC_LESSON_PAYMENTS_ENABLED?: string;
  readonly PUBLIC_STRIPE_PAYMENT_LINK_30MIN?: string;
  readonly PUBLIC_STRIPE_PAYMENT_LINK_60MIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
