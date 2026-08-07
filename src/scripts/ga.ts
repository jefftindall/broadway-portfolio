import {
  documentRequestsNoIndex,
  getGaMeasurementId,
  shouldLoadGa,
  trackGaEvent,
} from '../lib/analytics';

let initialized = false;
let clickBound = false;

export function initGa() {
  if (initialized || typeof window === 'undefined') return;
  if (!shouldLoadGa(window.location.pathname, documentRequestsNoIndex())) return;

  const measurementId = getGaMeasurementId();
  if (!measurementId) return;

  window.dataLayer = window.dataLayer || [];
  // gtag expects the Arguments object on the dataLayer (not a rest-args array).
  window.gtag = function gtag(..._args: unknown[]) {
    window.dataLayer?.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    anonymize_ip: true,
    send_page_view: true,
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  initialized = true;
  bindGaClickEvents();
}

/**
 * Declarative click tracking for public CTAs / downloads.
 *
 * Markup: `data-ga-event="select_content|file_download"` plus params:
 * - select_content: `data-ga-content-type`, `data-ga-content-id`
 * - file_download: `data-ga-file-name`, optional `data-ga-file-extension`
 */
function bindGaClickEvents() {
  if (clickBound || typeof document === 'undefined') return;
  clickBound = true;

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = target.closest<HTMLElement>('[data-ga-event]');
      if (!el) return;

      const name = el.getAttribute('data-ga-event')?.trim();
      if (!name) return;

      if (name === 'file_download') {
        const fileName = el.getAttribute('data-ga-file-name')?.trim() || '';
        const fileExtension =
          el.getAttribute('data-ga-file-extension')?.trim() ||
          (fileName.includes('.') ? fileName.split('.').pop() : '') ||
          '';
        const href = el instanceof HTMLAnchorElement ? el.href : el.getAttribute('href') || '';
        trackGaEvent('file_download', {
          file_name: fileName,
          file_extension: fileExtension,
          link_url: href || undefined,
          link_text: el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 100) || undefined,
        });
        return;
      }

      if (name === 'select_content') {
        trackGaEvent('select_content', {
          content_type: el.getAttribute('data-ga-content-type')?.trim() || undefined,
          content_id: el.getAttribute('data-ga-content-id')?.trim() || undefined,
        });
      }
    },
    { capture: true },
  );
}

initGa();

export { trackGaEvent };
