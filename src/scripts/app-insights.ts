import { ApplicationInsights } from '@microsoft/applicationinsights-web';

declare global {
  interface Window {
    __appInsights?: ApplicationInsights;
  }
}

const FORCE_SAMPLE_EVENTS = new Set([
  'StudioPublishUiSuccess',
  'StudioPublishUiFailed',
  'StudioPublishToProdCompleted',
]);
const FORCE_SAMPLE_METRICS = new Set([
  'StudioPublishToProdDurationMs',
  // OPS-P2-002 — field FCP for homepage SLO-6 (always ingest despite browser sampling).
  'HomepageFcpMs',
]);

let initialized = false;

function isHomepagePath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/';
}

/** Report first-contentful-paint on `/` only (SLO-6 field SLI). */
function trackHomepageFcp(appInsights: ApplicationInsights) {
  if (typeof window === 'undefined' || typeof performance === 'undefined') return;
  if (!isHomepagePath(window.location.pathname)) return;

  const report = (ms: number) => {
    if (!Number.isFinite(ms) || ms <= 0) return;
    appInsights.trackMetric({ name: 'HomepageFcpMs', average: ms }, { path: '/' });
  };

  try {
    const existing = performance.getEntriesByName('first-contentful-paint')[0];
    if (existing && typeof existing.startTime === 'number') {
      report(existing.startTime);
      return;
    }

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          report(entry.startTime);
          observer.disconnect();
          break;
        }
      }
    });
    observer.observe({ type: 'paint', buffered: true });
  } catch {
    // Paint timing unsupported — skip field FCP for this session.
  }
}

export function initAppInsights() {
  if (initialized || typeof window === 'undefined') return;
  if (window.__appInsights) {
    initialized = true;
    return;
  }
  const connectionString = import.meta.env.PUBLIC_APPINSIGHTS_CONNECTION_STRING as string | undefined;
  if (!connectionString) return;

  const sampleRaw = import.meta.env.PUBLIC_APPINSIGHTS_SAMPLE_PERCENT as string | undefined;
  const samplingPercentage = Number.parseFloat(sampleRaw || '10');

  const appInsights = new ApplicationInsights({
    config: {
      connectionString,
      enableAutoRouteTracking: true,
      enableCorsCorrelation: true,
      enableRequestHeaderTracking: false,
      enableResponseHeaderTracking: false,
      disableAjaxTracking: false,
      disableFetchTracking: false,
      disableCookiesUsage: true,
      samplingPercentage: Number.isFinite(samplingPercentage) ? samplingPercentage : 10,
    },
  });

  appInsights.loadAppInsights();
  appInsights.addTelemetryInitializer((envelope) => {
    const baseData = envelope.baseData as
      | { name?: string; properties?: Record<string, string> }
      | undefined;
    if (baseData?.properties) {
      delete baseData.properties.cookie;
      delete baseData.properties.auth;
    }
    // Studio publish UI events/metrics must always ingest despite global browser sampling.
    if (baseData?.name && FORCE_SAMPLE_EVENTS.has(baseData.name)) {
      (envelope as { sampleRate?: number }).sampleRate = 100;
    }
    if (baseData?.name && FORCE_SAMPLE_METRICS.has(baseData.name)) {
      (envelope as { sampleRate?: number }).sampleRate = 100;
    }
    return true;
  });
  appInsights.trackPageView();
  trackHomepageFcp(appInsights);
  window.__appInsights = appInsights;
  initialized = true;
}

export function trackEvent(name: string, properties?: Record<string, string>) {
  window.__appInsights?.trackEvent({ name, properties });
}

export function trackMetric(name: string, average: number, properties?: Record<string, string>) {
  window.__appInsights?.trackMetric({ name, average }, properties);
}

export function trackException(error: unknown, properties?: Record<string, string>) {
  const exception = error instanceof Error ? error : new Error(String(error));
  window.__appInsights?.trackException({ exception, properties });
}

export function flush() {
  window.__appInsights?.flush();
}

initAppInsights();
