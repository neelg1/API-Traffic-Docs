import { describe, expect, it } from 'vitest';
import type { Exchange } from '../../src/ingest/exchange';
import { dropReason, filterExchanges, isAnalyticsHost } from '../../src/ingest/filter';

// A synthetic API call that every rule keeps; tests override parts of it.
function exchange(overrides: Partial<Exchange> = {}): Exchange {
  return {
    index: 0,
    startedAt: undefined,
    method: 'GET',
    url: { full: 'https://api.example.com/v1/items', origin: 'https://api.example.com', host: 'api.example.com', path: '/v1/items' },
    query: [],
    requestHeaders: [],
    requestContentType: undefined,
    requestBody: { kind: 'none' },
    status: 200,
    responseHeaders: [],
    responseContentType: 'application/json',
    responseBody: { kind: 'json', value: [], sniffed: false },
    resourceType: 'fetch',
    ...overrides,
  };
}

describe('dropReason', () => {
  it('keeps a JSON fetch call', () => {
    expect(dropReason(exchange())).toBeNull();
  });

  it('drops requests that got no response', () => {
    expect(dropReason(exchange({ status: null, responseBody: { kind: 'omitted' } }))).toBe('no-response');
  });

  it.each([400, 401, 404, 422, 500])('keeps a %i JSON error response', (status) => {
    expect(dropReason(exchange({ status }))).toBeNull();
  });

  it('drops CORS preflight OPTIONS requests', () => {
    expect(dropReason(exchange({ method: 'OPTIONS', status: 204, responseBody: { kind: 'none' } }))).toBe('preflight');
  });

  it('drops calls to analytics hosts, even JSON fetches', () => {
    const url = { full: 'https://o1.ingest.sentry.io/api/1/envelope/', origin: 'https://o1.ingest.sentry.io', host: 'o1.ingest.sentry.io', path: '/api/1/envelope/' };
    expect(dropReason(exchange({ method: 'POST', url }))).toBe('analytics-host');
  });

  it.each(['document', 'script', 'stylesheet', 'image', 'font', 'media', 'manifest', 'ping', 'websocket'])(
    'drops resource type %s',
    (resourceType) => {
      expect(dropReason(exchange({ resourceType }))).toBe('not-api-resource');
    },
  );

  it.each(['fetch', 'xhr', 'other', 'something-new', undefined])('lets resource type %s through to the JSON check', (resourceType) => {
    expect(dropReason(exchange({ resourceType }))).toBeNull();
    expect(dropReason(exchange({ resourceType, responseContentType: 'text/html', responseBody: { kind: 'text', text: '<p>' } }))).toBe(
      'not-json',
    );
  });

  it('keeps sniffed JSON', () => {
    expect(dropReason(exchange({ responseContentType: 'text/plain', responseBody: { kind: 'json', value: {}, sniffed: true } }))).toBeNull();
  });

  it('keeps empty responses, e.g. a 204 from a DELETE', () => {
    expect(dropReason(exchange({ method: 'DELETE', status: 204, responseContentType: undefined, responseBody: { kind: 'none' } }))).toBeNull();
  });

  it('keeps uncaptured bodies typed as JSON, but not other uncaptured bodies', () => {
    expect(dropReason(exchange({ responseBody: { kind: 'omitted' } }))).toBeNull();
    expect(dropReason(exchange({ responseContentType: 'application/javascript', responseBody: { kind: 'omitted' } }))).toBe('not-json');
    expect(dropReason(exchange({ responseContentType: undefined, responseBody: { kind: 'omitted' } }))).toBe('not-json');
  });

  it.each([
    ['text', { kind: 'text', text: 'ok' }],
    ['binary', { kind: 'binary' }],
  ] as const)('drops %s responses', (_kind, responseBody) => {
    expect(dropReason(exchange({ responseContentType: 'text/plain', responseBody }))).toBe('not-json');
  });

  it('reports the first matching rule', () => {
    expect(dropReason(exchange({ status: null, method: 'OPTIONS', resourceType: 'script' }))).toBe('no-response');
    expect(dropReason(exchange({ method: 'OPTIONS', resourceType: 'preflight' }))).toBe('preflight');
  });
});

describe('isAnalyticsHost', () => {
  it.each(['sentry.io', 'o1.ingest.sentry.io', 'www.google-analytics.com', 'api.segment.io:443', 'Browser-Intake-Datadoghq.com'])(
    'matches %s',
    (host) => {
      expect(isAnalyticsHost(host)).toBe(true);
    },
  );

  it.each(['notsentry.io', 'sentry.io.example.com', 'api.example.com', 'localhost:8000', 'google.com'])('does not match %s', (host) => {
    expect(isAnalyticsHost(host)).toBe(false);
  });
});

describe('filterExchanges', () => {
  it('keeps API calls in order and records why the rest were dropped', () => {
    const result = filterExchanges([
      exchange({ index: 0 }),
      exchange({ index: 1, resourceType: 'image', responseContentType: 'image/png', responseBody: { kind: 'binary' } }),
      exchange({ index: 2, method: 'POST', status: 201 }),
      exchange({ index: 3, status: null, responseBody: { kind: 'omitted' } }),
    ]);
    expect(result.kept.map((e) => e.index)).toEqual([0, 2]);
    expect(result.dropped).toEqual([
      { index: 1, reason: 'not-api-resource' },
      { index: 3, reason: 'no-response' },
    ]);
  });

  it('returns empty lists for no input', () => {
    expect(filterExchanges([])).toEqual({ kept: [], dropped: [] });
  });
});
