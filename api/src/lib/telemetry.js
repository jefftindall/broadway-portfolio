/**
 * Lightweight App Insights custom events for SWA managed Functions.
 * Uses TelemetryClient only (no setup/auto-collect) so the host AI extension
 * still owns request telemetry and we avoid double-counting.
 */
import { TelemetryClient } from 'applicationinsights';

let client;

function getClient() {
  if (client) return client;
  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!connectionString) return null;
  client = new TelemetryClient(connectionString);
  // Studio custom events/exceptions must not be dropped by client-side sampling.
  client.config.samplingPercentage = 100;
  return client;
}

function toProps(properties = {}) {
  const out = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === 'string' ? value : String(value);
  }
  return out;
}

export function trackEvent(name, properties = {}) {
  try {
    const c = getClient();
    if (!c) return;
    c.trackEvent({ name, properties: toProps(properties) });
  } catch {
    // Telemetry must never break Studio publishes.
  }
}

export function trackException(error, properties = {}) {
  try {
    const c = getClient();
    if (!c) return;
    const err = error instanceof Error ? error : new Error(String(error));
    c.trackException({ exception: err, properties: toProps(properties) });
  } catch {
    // ignore
  }
}

/** Best-effort flush so short-lived Function returns do not drop the last events. */
export async function flush() {
  try {
    const c = getClient();
    if (!c) return;
    await new Promise((resolve) => {
      c.flush({
        callback: () => resolve(),
      });
      // Guard against SDKs that never invoke the callback.
      setTimeout(resolve, 2000);
    });
  } catch {
    // ignore
  }
}
