import { isJsonType } from './body';
import type { Exchange } from './exchange';

/** Why an exchange isn't an API call worth documenting. */
export type DropReason = 'no-response' | 'preflight' | 'analytics-host' | 'not-api-resource' | 'not-json';

export interface DroppedExchange {
  /** The exchange's position in its HAR log. */
  readonly index: number;
  readonly reason: DropReason;
}

export interface FilterResult {
  readonly kept: readonly Exchange[];
  readonly dropped: readonly DroppedExchange[];
}

/**
 * Analytics, session-replay, and error-tracking domains. A host matches the
 * domain itself or any subdomain (`o1.ingest.sentry.io` matches `sentry.io`).
 */
const ANALYTICS_DOMAINS: readonly string[] = [
  'amplitude.com',
  'browser-intake-datadoghq.com',
  'browser-intake-datadoghq.eu',
  'browser-intake-us3-datadoghq.com',
  'browser-intake-us5-datadoghq.com',
  'bugsnag.com',
  'clarity.ms',
  'datadoghq.com',
  'datadoghq.eu',
  'doubleclick.net',
  'fullstory.com',
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'heapanalytics.com',
  'hotjar.com',
  'hotjar.io',
  'logrocket.io',
  'lr-ingest.io',
  'mixpanel.com',
  'newrelic.com',
  'nr-data.net',
  'posthog.com',
  'segment.com',
  'segment.io',
  'sentry.io',
];

/** True when the host (port ignored) is a denylisted domain or a subdomain of one. */
export function isAnalyticsHost(host: string): boolean {
  const hostname = host.replace(/:\d+$/, '').toLowerCase();
  return ANALYTICS_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

/**
 * Chrome resource types that are never API calls: page navigations, assets,
 * beacons, and protocols outside v1. Types not listed here (including `fetch`,
 * `xhr`, `other`, and unknown ones) fall through to the JSON check.
 */
const NON_API_RESOURCE_TYPES: ReadonlySet<string> = new Set([
  'document',
  'stylesheet',
  'image',
  'media',
  'font',
  'script',
  'texttrack',
  'manifest',
  'ping',
  'cspviolationreport',
  'preflight',
  'prefetch',
  'signedexchange',
  'websocket',
  'eventsource',
]);

/** True for JSON responses, empty ones (e.g. 204), and uncaptured bodies typed as JSON. */
function isJsonResponse(exchange: Exchange): boolean {
  switch (exchange.responseBody.kind) {
    case 'json':
    case 'none':
      return true;
    case 'omitted':
      return isJsonType(exchange.responseContentType);
    default:
      return false;
  }
}

/** The first rule that drops this exchange, or null to keep it. */
export function dropReason(exchange: Exchange): DropReason | null {
  // 4xx and 5xx are real API responses and are kept; only "no response" is dropped.
  if (exchange.status === null) return 'no-response';
  if (exchange.method === 'OPTIONS') return 'preflight';
  if (isAnalyticsHost(exchange.url.host)) return 'analytics-host';
  if (exchange.resourceType !== undefined && NON_API_RESOURCE_TYPES.has(exchange.resourceType)) {
    return 'not-api-resource';
  }
  if (!isJsonResponse(exchange)) return 'not-json';
  return null;
}

/** Keeps API calls, in order, and records why each other exchange was dropped. */
export function filterExchanges(exchanges: readonly Exchange[]): FilterResult {
  const kept: Exchange[] = [];
  const dropped: DroppedExchange[] = [];
  for (const exchange of exchanges) {
    const reason = dropReason(exchange);
    if (reason === null) kept.push(exchange);
    else dropped.push({ index: exchange.index, reason });
  }
  return { kept, dropped };
}
