import { describe, expect, it } from 'vitest';
import { mediaType, parseRequestBody, parseResponseBody } from '../../src/ingest/body';
import { parseHarEntry } from '../../src/ingest/parse-har';

// Base64 fixtures (synthetic): '{"id":1}', a PNG signature, and invalid UTF-8 bytes FF FE.
const BASE64_JSON = 'eyJpZCI6MX0=';
const BASE64_PNG = 'iVBORw0KGgo=';
const BASE64_NOT_UTF8 = '//4=';

describe('mediaType', () => {
  it.each([
    ['Application/JSON; charset=utf-8', 'application/json'],
    ['  text/plain ', 'text/plain'],
    ['', undefined],
    [undefined, undefined],
  ])('normalizes %j to %j', (input, expected) => {
    expect(mediaType(input)).toBe(expected);
  });
});

describe('parseResponseBody', () => {
  it('parses JSON, keeping nesting, numbers, and nulls', () => {
    const text = '{"data":[{"id":"a","count":2,"owner":null}],"total":1.5}';
    expect(parseResponseBody({ text, size: text.length }, 'application/json')).toEqual({
      kind: 'json',
      value: { data: [{ id: 'a', count: 2, owner: null }], total: 1.5 },
      sniffed: false,
    });
  });

  it.each(['application/problem+json', 'application/vnd.api+json', 'text/json'])('treats %s as JSON', (type) => {
    expect(parseResponseBody({ text: '{"a":1}' }, type)).toMatchObject({ kind: 'json', sniffed: false });
  });

  it.each(['text/plain', undefined])('sniffs JSON sent as %s', (type) => {
    expect(parseResponseBody({ text: ' [1,2]' }, type)).toEqual({ kind: 'json', value: [1, 2], sniffed: true });
  });

  it('keeps text that looks like JSON but does not parse', () => {
    expect(parseResponseBody({ text: '{not json' }, 'text/plain')).toEqual({ kind: 'text', text: '{not json' });
  });

  it('keeps JSON-typed text that does not parse as text', () => {
    expect(parseResponseBody({ text: 'oops' }, 'application/json')).toEqual({ kind: 'text', text: 'oops' });
  });

  it('does not sniff other text types', () => {
    expect(parseResponseBody({ text: '[]' }, 'text/html')).toEqual({ kind: 'text', text: '[]' });
  });

  it('decodes base64 text, then parses it by type', () => {
    expect(parseResponseBody({ text: BASE64_JSON, encoding: 'base64' }, 'application/json')).toEqual({
      kind: 'json',
      value: { id: 1 },
      sniffed: false,
    });
  });

  it('treats base64 of a binary type as binary without decoding', () => {
    expect(parseResponseBody({ text: BASE64_PNG, encoding: 'base64' }, 'image/png')).toEqual({ kind: 'binary' });
  });

  it.each([BASE64_NOT_UTF8, 'not base64!'])('treats undecodable base64 (%s) as binary', (text) => {
    expect(parseResponseBody({ text, encoding: 'base64' }, 'text/plain')).toEqual({ kind: 'binary' });
  });

  it.each([
    ['empty text', { text: '', size: 0 }, 'none'],
    ['no text and size 0 (e.g. 204)', { size: 0 }, 'none'],
    ['no text but a size (body removed from the HAR)', { size: 1234 }, 'omitted'],
    ['no text and size -1 (no response)', { size: -1 }, 'omitted'],
    ['a malformed content object', 'nope', 'omitted'],
  ])('gives the right kind for %s', (_case, content, kind) => {
    expect(parseResponseBody(content, 'application/json')).toEqual({ kind });
  });
});

describe('parseRequestBody', () => {
  it('has no body when there is no postData', () => {
    expect(parseRequestBody(undefined, undefined)).toEqual({ kind: 'none' });
  });

  it('decodes URL-encoded form text, in order, keeping duplicates', () => {
    const body = parseRequestBody({ text: 'username=a%40example.com&scope=x&scope=y' }, 'application/x-www-form-urlencoded');
    expect(body).toEqual({
      kind: 'form',
      fields: [
        { name: 'username', value: 'a@example.com' },
        { name: 'scope', value: 'x' },
        { name: 'scope', value: 'y' },
      ],
    });
  });

  it('uses params when a form has no text', () => {
    const body = parseRequestBody({ params: [{ name: 'a', value: '1' }, { name: 'b' }] }, 'application/x-www-form-urlencoded');
    expect(body).toEqual({ kind: 'form', fields: [{ name: 'a', value: '1' }, { name: 'b', value: '' }] });
  });

  it('uses params for multipart bodies, whose text is not usable', () => {
    const body = parseRequestBody(
      { text: '--boundary\r\n...', params: [{ name: 'title', value: 'x' }] },
      'multipart/form-data',
    );
    expect(body).toEqual({ kind: 'form', fields: [{ name: 'title', value: 'x' }] });
  });

  it('parses JSON request bodies', () => {
    expect(parseRequestBody({ text: '{"title":"x"}' }, 'application/json')).toEqual({
      kind: 'json',
      value: { title: 'x' },
      sniffed: false,
    });
  });

  it('gives omitted for postData that is not an object or has no text or params', () => {
    expect(parseRequestBody('nope', undefined)).toEqual({ kind: 'omitted' });
    expect(parseRequestBody({}, 'application/json')).toEqual({ kind: 'omitted' });
  });
});

describe('parseHarEntry bodies and content types', () => {
  const entry = (request: object, response: object) => ({
    request: { method: 'POST', url: 'https://api.example.com/v1/items', headers: [], ...request },
    response: { status: 200, headers: [], ...response },
  });

  it('takes the content type from the header first, normalized', () => {
    const result = parseHarEntry(
      entry(
        { headers: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }], postData: { mimeType: 'text/plain', text: '{"a":1}' } },
        { content: { mimeType: 'application/json', text: '{"id":"x"}' } },
      ),
    );
    if (!result.ok) throw new Error(result.error.reason);
    expect(result.exchange.requestContentType).toBe('application/json');
    expect(result.exchange.requestBody).toMatchObject({ kind: 'json', sniffed: false });
    expect(result.exchange.responseContentType).toBe('application/json');
    expect(result.exchange.responseBody).toEqual({ kind: 'json', value: { id: 'x' }, sniffed: false });
  });

  it('leaves the content type undefined when nothing records it', () => {
    const result = parseHarEntry(entry({}, { content: { size: 0 } }));
    if (!result.ok) throw new Error(result.error.reason);
    expect(result.exchange.requestContentType).toBeUndefined();
    expect(result.exchange.requestBody).toEqual({ kind: 'none' });
    expect(result.exchange.responseBody).toEqual({ kind: 'none' });
  });

  it('parses an entry whose body fields are malformed instead of failing it', () => {
    const result = parseHarEntry(entry({ postData: 42 }, { content: [] }));
    expect(result.ok).toBe(true);
  });
});
