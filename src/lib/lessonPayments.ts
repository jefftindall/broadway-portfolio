/** Public lesson-pay config. Secret/restricted Stripe keys never belong here. */

export const LESSON_PAY_RATE_IDS = ['30min', '60min'] as const;

export type LessonPayRateId = (typeof LESSON_PAY_RATE_IDS)[number];

export type LessonPayConfig = {
  enabled: boolean;
  links: Partial<Record<LessonPayRateId, string>>;
};

const STRIPE_PAYMENT_LINK_HOST = 'buy.stripe.com';

export function sanitizeStripePaymentLink(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw || raw === 'REPLACE_ME') return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname !== STRIPE_PAYMENT_LINK_HOST) return null;
  if (url.username || url.password) return null;
  return url.toString();
}

function flagEnabled(value: unknown): boolean {
  return /^(1|true|yes)$/i.test(String(value ?? '').trim());
}

/**
 * Local `astro dev` / `.env` only. CD does not bake these — staging and prod
 * share one artifact, so the live flag and Payment Links come from
 * `GET /api/lessonPayConfig`.
 */
export function bakedLessonPayConfig(): LessonPayConfig {
  const enabled = flagEnabled(import.meta.env.PUBLIC_LESSON_PAYMENTS_ENABLED);
  const links: LessonPayConfig['links'] = {};
  const thirty = sanitizeStripePaymentLink(import.meta.env.PUBLIC_STRIPE_PAYMENT_LINK_30MIN);
  const sixty = sanitizeStripePaymentLink(import.meta.env.PUBLIC_STRIPE_PAYMENT_LINK_60MIN);
  if (thirty) links['30min'] = thirty;
  if (sixty) links['60min'] = sixty;
  if (!enabled || Object.keys(links).length === 0) {
    return { enabled: false, links: {} };
  }
  return { enabled: true, links };
}

export function parseLessonPayConfig(data: unknown): LessonPayConfig {
  if (!data || typeof data !== 'object') return { enabled: false, links: {} };
  const record = data as Record<string, unknown>;
  const rawLinks =
    record.links && typeof record.links === 'object'
      ? (record.links as Record<string, unknown>)
      : {};
  const links: LessonPayConfig['links'] = {};
  for (const id of LESSON_PAY_RATE_IDS) {
    const href = sanitizeStripePaymentLink(rawLinks[id]);
    if (href) links[id] = href;
  }
  const enabled = flagEnabled(record.enabled) && Object.keys(links).length > 0;
  return enabled ? { enabled: true, links } : { enabled: false, links: {} };
}
