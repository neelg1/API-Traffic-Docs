import { mediaType, parseRequestBody, parseResponseBody } from './body';
import type { EntryResult, Exchange, NameValue, ParseError, ParseResult } from './exchange';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a HAR `[{ name, value }]` list; undefined if it isn't one. */
function readNameValues(list: unknown, lowerCaseNames: boolean): NameValue[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const pairs: NameValue[] = [];
  for (const item of list) {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.value !== 'string') {
      return undefined;
    }
    pairs.push({ name: lowerCaseNames ? item.name.toLowerCase() : item.name, value: item.value });
  }
  return pairs;
}

/** The Content-Type header if present, else the HAR's recorded MIME type. */
function contentType(headers: readonly NameValue[], harMimeType: unknown): string | undefined {
  const header = headers.find((h) => h.name === 'content-type')?.value;
  return mediaType(header ?? (typeof harMimeType === 'string' ? harMimeType : undefined));
}

/**
 * Parses one HAR entry, e.g. from a HAR file or Chrome's
 * `devtools.network.onRequestFinished`. Never throws.
 */
export function parseHarEntry(entry: unknown, index = 0): EntryResult {
  const fail = (reason: string): EntryResult => ({ ok: false, error: { index, reason } });

  if (!isRecord(entry)) return fail('entry is not an object');
  const { request, response } = entry;
  if (!isRecord(request)) return fail('request is missing');
  if (!isRecord(response)) return fail('response is missing');

  const { method, url: rawUrl } = request;
  if (typeof method !== 'string' || method === '') return fail('request.method is missing');
  if (typeof rawUrl !== 'string' || !URL.canParse(rawUrl)) {
    return fail('request.url is not an absolute URL');
  }
  if (typeof response.status !== 'number') return fail('response.status is not a number');

  const requestHeaders = readNameValues(request.headers, true);
  if (!requestHeaders) return fail('request.headers is not a list of name/value pairs');
  const responseHeaders = readNameValues(response.headers, true);
  if (!responseHeaders) return fail('response.headers is not a list of name/value pairs');

  const url = new URL(rawUrl);
  const { postData } = request;
  const { content } = response;
  const requestContentType = contentType(requestHeaders, isRecord(postData) ? postData.mimeType : undefined);
  const responseContentType = contentType(responseHeaders, isRecord(content) ? content.mimeType : undefined);
  const exchange: Exchange = {
    index,
    startedAt: typeof entry.startedDateTime === 'string' ? entry.startedDateTime : undefined,
    method: method.toUpperCase(),
    url: { full: rawUrl, origin: url.origin, host: url.host, path: url.pathname },
    query: [...url.searchParams].map(([name, value]) => ({ name, value })),
    requestHeaders,
    requestContentType,
    requestBody: parseRequestBody(postData, requestContentType),
    // Chrome records a missing response as 0, Playwright as -1.
    status: response.status > 0 ? response.status : null,
    responseHeaders,
    responseContentType,
    responseBody: parseResponseBody(content, responseContentType),
    resourceType: typeof entry._resourceType === 'string' ? entry._resourceType : undefined,
  };
  return { ok: true, exchange };
}

/**
 * Parses a whole HAR log (already JSON-parsed). Malformed entries become
 * errors and the rest still parse. Never throws.
 */
export function parseHar(har: unknown): ParseResult {
  const entries = isRecord(har) && isRecord(har.log) ? har.log.entries : undefined;
  if (!Array.isArray(entries)) {
    return { exchanges: [], errors: [{ index: null, reason: 'log.entries is not a list' }] };
  }

  const exchanges: Exchange[] = [];
  const errors: ParseError[] = [];
  entries.forEach((entry: unknown, index) => {
    const result = parseHarEntry(entry, index);
    if (result.ok) exchanges.push(result.exchange);
    else errors.push(result.error);
  });
  return { exchanges, errors };
}
