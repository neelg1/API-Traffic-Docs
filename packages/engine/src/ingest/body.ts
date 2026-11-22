import type { Body, JsonValue, NameValue } from './exchange';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `Application/JSON; charset=utf-8` -> `application/json`; undefined if empty. */
export function mediaType(contentType: string | undefined): string | undefined {
  const type = contentType?.split(';')[0]?.trim().toLowerCase();
  return type ? type : undefined;
}

function isJsonType(type: string | undefined): boolean {
  return type !== undefined && (type.endsWith('/json') || type.endsWith('+json'));
}

/** Types whose bodies are never text, so they aren't decoded or sniffed. */
function isBinaryType(type: string | undefined): boolean {
  return (
    type !== undefined &&
    (/^(image|audio|video|font)\//.test(type) ||
      ['application/octet-stream', 'application/pdf', 'application/zip'].includes(type))
  );
}

function tryParseJson(text: string): JsonValue | undefined {
  try {
    // JSON.parse only ever produces JSON values.
    return JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
}

/** Decodes base64 to UTF-8 text; undefined if it isn't valid base64 or UTF-8. */
function decodeBase64Text(data: string): string | undefined {
  try {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function formFields(text: string): NameValue[] {
  return [...new URLSearchParams(text)].map(([name, value]) => ({ name, value }));
}

/** HAR `postData.params`: `[{ name, value? }]`; undefined if it isn't one. */
function readParams(params: unknown): NameValue[] | undefined {
  if (!Array.isArray(params)) return undefined;
  const fields: NameValue[] = [];
  for (const param of params) {
    if (!isRecord(param) || typeof param.name !== 'string') return undefined;
    fields.push({ name: param.name, value: typeof param.value === 'string' ? param.value : '' });
  }
  return fields;
}

/** Interprets body text by media type. JSON sent as text/plain (or untyped) is sniffed. */
function parseText(text: string, type: string | undefined): Body {
  if (text === '') return { kind: 'none' };
  if (type === 'application/x-www-form-urlencoded') return { kind: 'form', fields: formFields(text) };
  if (isJsonType(type)) {
    const value = tryParseJson(text);
    return value === undefined ? { kind: 'text', text } : { kind: 'json', value, sniffed: false };
  }
  if (type === undefined || type === 'text/plain') {
    const trimmed = text.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const value = tryParseJson(text);
      if (value !== undefined) return { kind: 'json', value, sniffed: true };
    }
  }
  return { kind: 'text', text };
}

/** Parses HAR `request.postData`. Malformed shapes become `omitted`, never errors. */
export function parseRequestBody(postData: unknown, type: string | undefined): Body {
  if (postData === undefined) return { kind: 'none' };
  if (!isRecord(postData)) return { kind: 'omitted' };
  const params = readParams(postData.params);
  if (typeof postData.text === 'string' && !type?.startsWith('multipart/')) {
    return parseText(postData.text, type);
  }
  // Multipart bodies, or forms captured as params only.
  if (params && params.length > 0) return { kind: 'form', fields: params };
  return typeof postData.text === 'string' ? parseText(postData.text, type) : { kind: 'omitted' };
}

/** Parses HAR `response.content`. Malformed shapes become `omitted`, never errors. */
export function parseResponseBody(content: unknown, type: string | undefined): Body {
  if (!isRecord(content)) return { kind: 'omitted' };
  const { text, encoding, size } = content;
  // No text: nothing was sent (size 0), or the body exists but wasn't captured.
  if (typeof text !== 'string') return size === 0 ? { kind: 'none' } : { kind: 'omitted' };
  if (encoding !== 'base64') return parseText(text, type);
  if (isBinaryType(type)) return { kind: 'binary' };
  const decoded = decodeBase64Text(text);
  return decoded === undefined ? { kind: 'binary' } : parseText(decoded, type);
}
