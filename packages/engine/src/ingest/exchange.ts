/** A header or query parameter. Names keep their order and duplicates. */
export interface NameValue {
  readonly name: string;
  readonly value: string;
}

export interface ParsedUrl {
  /** The URL exactly as captured. */
  readonly full: string;
  /** Scheme, host, and port, e.g. `http://localhost:8000`. */
  readonly origin: string;
  /** Host and port, e.g. `localhost:8000`. */
  readonly host: string;
  /** Path without the query string, still percent-encoded, e.g. `/api/v1/items/`. */
  readonly path: string;
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** A request or response body, parsed by content type. */
export type Body =
  /** Parsed JSON. `sniffed` is true when the content type didn't say JSON (e.g. text/plain). */
  | { readonly kind: 'json'; readonly value: JsonValue; readonly sniffed: boolean }
  /** URL-encoded or multipart form fields, decoded, in order. */
  | { readonly kind: 'form'; readonly fields: readonly NameValue[] }
  /** Any other text, including JSON-typed text that doesn't parse. */
  | { readonly kind: 'text'; readonly text: string }
  /** Non-text content (images, files). */
  | { readonly kind: 'binary' }
  /** The message has no body (e.g. a GET request, a 204 response). */
  | { readonly kind: 'none' }
  /** A body existed but wasn't captured (removed from the HAR, or no response). */
  | { readonly kind: 'omitted' };

/** One request and its response from captured traffic, parsed and typed. */
export interface Exchange {
  /** Position of the entry in its HAR log. */
  readonly index: number;
  /** When the request started, as recorded (ISO 8601). Never read from a clock. */
  readonly startedAt: string | undefined;
  /** Upper-case HTTP method. */
  readonly method: string;
  readonly url: ParsedUrl;
  /** Query parameters, decoded, in URL order. */
  readonly query: readonly NameValue[];
  /** Header names are lower-cased; values are as captured. */
  readonly requestHeaders: readonly NameValue[];
  /** Media type without parameters, lower-cased (e.g. `application/json`), if known. */
  readonly requestContentType: string | undefined;
  readonly requestBody: Body;
  /** HTTP status, or null when no response was received (HAR 0 or -1: aborted, blocked, failed). */
  readonly status: number | null;
  /** Header names are lower-cased; values are as captured. */
  readonly responseHeaders: readonly NameValue[];
  /** Media type without parameters, lower-cased (e.g. `application/json`), if known. */
  readonly responseContentType: string | undefined;
  readonly responseBody: Body;
  /** Chrome's resource type (`document`, `script`, `xhr`, `fetch`, ...), when the capture recorded it. */
  readonly resourceType: string | undefined;
}

/**
 * Why an entry couldn't be parsed. Reasons name the field, never its value,
 * so errors can be logged safely (CLAUDE.md rule 5).
 */
export interface ParseError {
  /** The entry's position in the HAR log, or null when the whole input is malformed. */
  readonly index: number | null;
  readonly reason: string;
}

export interface ParseResult {
  readonly exchanges: readonly Exchange[];
  readonly errors: readonly ParseError[];
}

export type EntryResult =
  | { readonly ok: true; readonly exchange: Exchange }
  | { readonly ok: false; readonly error: ParseError };
