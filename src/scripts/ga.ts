import { documentRequestsNoIndex, getGaMeasurementId, shouldLoadGa } from '../lib/analytics';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

export function initGa() {
  if (initialized || typeof window === 'undefined') return;
  if (!shouldLoadGa(window.location.pathname, documentRequestsNoIndex())) return;

  const measurementId = getGaMeasurementId();
  if (!measurementId) return;

  window.dataLayer = window.dataLayer || [];
  // gtag expects the Arguments object on the dataLayer (not a rest-args array).
  window.gtag = function gtag(..._args: unknown[]) {
    // eslint-disable-next-line prefer-rest-params -- GA dataLayer contract
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
}

initGa();
