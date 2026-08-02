/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly SITE_CONTACT_EMAIL?: string;
  readonly SITE_CONTACT_PHONE?: string;
  readonly SITE_DATE_OF_BIRTH?: string;
  readonly PUBLIC_APPINSIGHTS_CONNECTION_STRING?: string;
  readonly PUBLIC_APPINSIGHTS_SAMPLE_PERCENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
