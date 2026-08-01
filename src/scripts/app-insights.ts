import { ApplicationInsights } from '@microsoft/applicationinsights-web';

declare global {
  interface Window {
    __appInsights?: ApplicationInsights;
  }
}

const FORCE_SAMPLE_EVENTS = new Set(['StudioPublishUiSuccess', 'StudioPublishUiFailed']);

let initialized = false;

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
    // Studio publish UI events must always ingest despite global browser sampling.
    if (baseData?.name && FORCE_SAMPLE_EVENTS.has(baseData.name)) {
      (envelope as { sampleRate?: number }).sampleRate = 100;
    }
    return true;
  });
  appInsights.trackPageView();
  window.__appInsights = appInsights;
  initialized = true;
}

export function trackEvent(name: string, properties?: Record<string, string>) {
  window.__appInsights?.trackEvent({ name, properties });
}

export function trackException(error: unknown, properties?: Record<string, string>) {
  const exception = error instanceof Error ? error : new Error(String(error));
  window.__appInsights?.trackException({ exception, properties });
}

export function flush() {
  window.__appInsights?.flush();
}

initAppInsights();
