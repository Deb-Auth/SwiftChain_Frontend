/**
 * Analytics instrumentation.
 *
 * A small, provider-agnostic event tracker for key conversion events (a
 * delivery requested, a bid submitted, escrow released) and operational events
 * (API failures, live-tracking connection changes).
 *
 * Design rules:
 * - Typed catalog: every event and its properties are declared in
 *   `AnalyticsEventMap`, so call sites cannot invent ad-hoc event names.
 * - Privacy first: tracking is off for Do Not Track users, and property keys
 *   that look like PII (email, phone, address, token, ...) are stripped at
 *   runtime as a second line of defence. Only opaque ids and coarse values
 *   belong in properties.
 * - Never breaks the app: `track` swallows every error and is a no-op on the
 *   server.
 * - Delivery is pluggable: events go to registered sinks. When
 *   `NEXT_PUBLIC_ANALYTICS_ENDPOINT` is set, a default sink POSTs them there.
 */

export interface AnalyticsEventMap {
  // Conversion events
  delivery_request_created: { packageSize: string };
  bid_submitted: { contractId: string };
  escrow_release_succeeded: { escrowId: string; deliveryId: string };
  escrow_release_failed: { escrowId: string; deliveryId: string };
  // Operational events
  api_request_failed: {
    method: string;
    path: string;
    status: number | 'network_error';
  };
  tracking_connection_changed: { status: 'connected' | 'reconnecting' | 'disconnected' };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;

export interface AnalyticsEvent<N extends AnalyticsEventName = AnalyticsEventName> {
  name: N;
  properties: AnalyticsEventMap[N];
  /** ISO 8601 timestamp of when the event occurred. */
  timestamp: string;
  /** Random per-page-load id; never persisted, so it cannot identify a person. */
  sessionId: string;
  /** Pathname only, with no query string or hash. */
  path: string;
}

export type AnalyticsSink = (event: AnalyticsEvent) => void;

/** Keys whose values might identify a person; removed before dispatch. */
const PII_KEY_PATTERN = /e-?mail|phone|address|wallet|token|password|secret|name|signature/i;

const sinks = new Set<AnalyticsSink>();
let sessionId: string | null = null;

function getSessionId(): string {
  if (!sessionId) {
    sessionId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return sessionId;
}

/** True when the browser has asked not to be tracked. */
function isDoNotTrackEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  const dnt =
    navigator.doNotTrack ??
    (typeof window !== 'undefined'
      ? (window as unknown as { doNotTrack?: string }).doNotTrack
      : undefined);
  return dnt === '1' || dnt === 'yes';
}

/** Removes PII-looking keys from an event's properties. */
export function sanitizeProperties<T extends object>(properties: T): T {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (PII_KEY_PATTERN.test(key)) continue;
    clean[key] = value;
  }
  return clean as T;
}

/**
 * Reduces an API URL to its path, dropping the origin, query string and hash,
 * and replaces id-like segments so that cardinality stays low and no
 * identifiers leak in the path.
 */
export function normalizeApiPath(url: string | undefined): string {
  if (!url) return 'unknown';
  let path = url;
  try {
    path = new URL(url, 'http://placeholder.local').pathname;
  } catch {
    path = url.split(/[?#]/)[0];
  }
  return path
    .split('/')
    .map((segment) =>
      /^[0-9]+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) || segment.length > 24
        ? ':id'
        : segment,
    )
    .join('/');
}

/** Registers a sink and returns a function that removes it. */
export function registerAnalyticsSink(sink: AnalyticsSink): () => void {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
}

/** HTTP sink that ships events to `NEXT_PUBLIC_ANALYTICS_ENDPOINT`. */
function createEndpointSink(endpoint: string): AnalyticsSink {
  return (event) => {
    const body = JSON.stringify(event);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const queued = navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      if (queued) return;
    }
    if (typeof fetch === 'function') {
      void fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  };
}

let defaultSinkRegistered = false;

function ensureDefaultSink(): void {
  if (defaultSinkRegistered) return;
  defaultSinkRegistered = true;
  const endpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
  if (endpoint) {
    sinks.add(createEndpointSink(endpoint));
  } else if (process.env.NODE_ENV === 'development') {
    sinks.add((event) => {
      // eslint-disable-next-line no-console -- development-only diagnostics sink
      console.debug('[analytics]', event.name, event.properties);
    });
  }
}

/**
 * Records an analytics event. Safe to call from anywhere: it does nothing on
 * the server or for Do Not Track users, and it never throws.
 */
export function track<N extends AnalyticsEventName>(
  name: N,
  properties: AnalyticsEventMap[N],
): void {
  try {
    if (typeof window === 'undefined' || isDoNotTrackEnabled()) return;
    ensureDefaultSink();
    if (sinks.size === 0) return;

    const event: AnalyticsEvent<N> = {
      name,
      properties: sanitizeProperties(properties),
      timestamp: new Date().toISOString(),
      sessionId: getSessionId(),
      path: window.location?.pathname ?? '',
    };

    sinks.forEach((sink) => {
      try {
        sink(event as AnalyticsEvent);
      } catch {
        // A failing sink must not affect other sinks or the caller.
      }
    });
  } catch {
    // Analytics must never break the application.
  }
}

/** Test helper: clears sinks and session state. */
export function resetAnalyticsForTests(): void {
  sinks.clear();
  sessionId = null;
  defaultSinkRegistered = false;
}
