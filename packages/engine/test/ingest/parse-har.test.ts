import { describe, expect, it } from 'vitest';
import { parseHar, parseHarEntry } from '../../src/ingest/parse-har';

// A minimal, valid HAR entry with synthetic values; tests override parts of it.
function harEntry(overrides: { request?: object; response?: object; [key: string]: unknown } = {}) {
  const { request, response, ...rest } = overrides;
  return {
    startedDateTime: '2026-01-01T00:00:00.000Z',
    request: { method: 'GET', url: 'https://api.example.com/v1/items?limit=2', headers: [], ...request },
    response: { status: 200, headers: [], ...response },
    ...rest,
  };
}

function parseOk(entry: unknown) {
  const result = parseHarEntry(entry);
  if (!result.ok) throw new Error(`expected entry to parse: ${result.error.reason}`);
  return result.exchange;
}

describe('parseHarEntry', () => {
  it('splits the URL into origin, host, and path, keeping the captured URL', () => {
    const exchange = parseOk(harEntry({ request: { url: 'http://localhost:8000/api/v1/items/?skip=0' } }));
    expect(exchange.url).toEqual({
      full: 'http://localhost:8000/api/v1/items/?skip=0',
      origin: 'http://localhost:8000',
      host: 'localhost:8000',
      path: '/api/v1/items/',
    });
  });

  it('keeps the path percent-encoded', () => {
    const exchange = parseOk(
      harEntry({ request: { url: 'https://api.example.com/v1/password-recovery/user%40example.com' } }),
    );
    expect(exchange.url.path).toBe('/v1/password-recovery/user%40example.com');
  });

  it('decodes query parameters in order, keeping duplicates', () => {
    const exchange = parseOk(harEntry({ request: { url: 'https://api.example.com/search?tag=a&q=hello%20world&tag=b' } }));
    expect(exchange.query).toEqual([
      { name: 'tag', value: 'a' },
      { name: 'q', value: 'hello world' },
      { name: 'tag', value: 'b' },
    ]);
  });

  it('upper-cases the method and lower-cases header names', () => {
    const exchange = parseOk(
      harEntry({
        request: { method: 'post', headers: [{ name: 'Content-Type', value: 'application/json' }] },
        response: { headers: [{ name: 'Set-Cookie', value: 'a=1' }, { name: 'set-cookie', value: 'b=2' }] },
      }),
    );
    expect(exchange.method).toBe('POST');
    expect(exchange.requestHeaders).toEqual([{ name: 'content-type', value: 'application/json' }]);
    expect(exchange.responseHeaders).toEqual([
      { name: 'set-cookie', value: 'a=1' },
      { name: 'set-cookie', value: 'b=2' },
    ]);
  });

  it.each([0, -1])('gives status null when no response was received (HAR %i)', (status) => {
    expect(parseOk(harEntry({ response: { status } })).status).toBeNull();
  });

  it('keeps real statuses, including errors', () => {
    expect(parseOk(harEntry({ response: { status: 404 } })).status).toBe(404);
  });

  it('passes through Chrome resource type and start time when present', () => {
    const exchange = parseOk(harEntry({ _resourceType: 'xhr' }));
    expect(exchange.resourceType).toBe('xhr');
    expect(exchange.startedAt).toBe('2026-01-01T00:00:00.000Z');

    const bare = parseOk(harEntry({ startedDateTime: undefined }));
    expect(bare.resourceType).toBeUndefined();
    expect(bare.startedAt).toBeUndefined();
  });

  it.each([
    ['entry is not an object', 'not an entry'],
    ['request is missing', { response: harEntry().response }],
    ['response is missing', { request: harEntry().request }],
    ['request.method is missing', harEntry({ request: { method: '' } })],
    ['request.url is not an absolute URL', harEntry({ request: { url: '/relative/path' } })],
    ['response.status is not a number', harEntry({ response: { status: '200' } })],
    ['request.headers is not a list of name/value pairs', harEntry({ request: { headers: [{ name: 'x' }] } })],
    ['response.headers is not a list of name/value pairs', harEntry({ response: { headers: {} } })],
  ])('reports "%s" for a malformed entry instead of throwing', (reason, entry) => {
    expect(parseHarEntry(entry, 7)).toEqual({ ok: false, error: { index: 7, reason } });
  });

  it('never puts captured values in error reasons (rule 5)', () => {
    const secret = 'synthetic-secret-token-123';
    const result = parseHarEntry(harEntry({ request: { url: `not a url ${secret}` } }));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe('parseHar', () => {
  it('parses every entry in order and collects errors without stopping', () => {
    const result = parseHar({
      log: { entries: [harEntry(), 'broken', harEntry({ request: { method: 'DELETE' } })] },
    });
    expect(result.exchanges.map((e) => [e.index, e.method])).toEqual([
      [0, 'GET'],
      [2, 'DELETE'],
    ]);
    expect(result.errors).toEqual([{ index: 1, reason: 'entry is not an object' }]);
  });

  it.each([null, {}, { log: {} }, { log: { entries: 'nope' } }])(
    'reports a single file-level error for input that is not a HAR log (%j)',
    (input) => {
      expect(parseHar(input)).toEqual({
        exchanges: [],
        errors: [{ index: null, reason: 'log.entries is not a list' }],
      });
    },
  );

  it('is deterministic: the same input gives the same output', () => {
    const har = { log: { entries: [harEntry(), harEntry({ _resourceType: 'fetch' })] } };
    expect(parseHar(har)).toEqual(parseHar(JSON.parse(JSON.stringify(har))));
  });
});
