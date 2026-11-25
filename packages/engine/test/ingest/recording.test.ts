import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterExchanges, parseHar } from '../../src/index';

// Eval app 1's recorded walkthrough (see eval/recordings/README.md).
// Assertions cover counts, kinds, and field names only, never values (rule 5).
const harPath = join(import.meta.dirname, '../../../../eval/recordings/fastapi-template.har');
const har: unknown = JSON.parse(readFileSync(harPath, 'utf8'));
const { exchanges, errors } = parseHar(har);
const api = exchanges.filter((e) => e.url.path.startsWith('/api/'));

describe('parseHar on the fastapi-template recording', () => {
  it('parses every entry without errors', () => {
    expect(errors).toEqual([]);
    expect(exchanges).toHaveLength(282);
  });

  it('finds the 61 API calls, all fetch or XHR', () => {
    expect(api).toHaveLength(61);
    expect(api.every((e) => e.resourceType === 'fetch' || e.resourceType === 'xhr')).toBe(true);
  });

  it('parses every answered API response as JSON, without sniffing', () => {
    const answered = api.filter((e) => e.status !== null);
    expect(answered.length).toBeGreaterThan(0);
    for (const e of answered) {
      expect(e.responseContentType).toBe('application/json');
      expect(e.responseBody).toMatchObject({ kind: 'json', sniffed: false });
    }
  });

  it('marks aborted calls as status null with an omitted body', () => {
    const aborted = api.filter((e) => e.status === null);
    expect(aborted).toHaveLength(3);
    expect(aborted.every((e) => e.responseBody.kind === 'omitted')).toBe(true);
  });

  it('reads the login body as form fields', () => {
    const logins = api.filter((e) => e.url.path === '/api/v1/login/access-token');
    expect(logins.length).toBeGreaterThan(0);
    for (const e of logins) {
      expect(e.requestBody.kind).toBe('form');
      if (e.requestBody.kind === 'form') {
        expect(e.requestBody.fields.map((f) => f.name)).toEqual(['username', 'password']);
      }
    }
  });

  it('parses JSON request bodies for writes that send one', () => {
    const jsonWrites = api.filter((e) => e.requestContentType === 'application/json');
    expect(jsonWrites.length).toBeGreaterThan(0);
    expect(jsonWrites.every((e) => e.requestBody.kind === 'json')).toBe(true);
  });

  it('leaves asset bodies omitted, as the recording dropped them', () => {
    const assets = exchanges.filter((e) => ['script', 'stylesheet', 'image'].includes(e.resourceType ?? ''));
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.every((e) => e.responseBody.kind === 'omitted')).toBe(true);
  });
});

describe('filterExchanges on the fastapi-template recording', () => {
  const { kept, dropped } = filterExchanges(exchanges);
  const reasons = (reason: string) => dropped.filter((d) => d.reason === reason).length;

  it('keeps exactly the answered API calls', () => {
    expect(kept.map((e) => e.index)).toEqual(api.filter((e) => e.status !== null).map((e) => e.index));
    expect(kept).toHaveLength(58);
  });

  it('drops assets and page loads as non-API resources, and aborted calls as no-response', () => {
    expect(reasons('not-api-resource')).toBe(221);
    expect(reasons('no-response')).toBe(3);
    expect(kept.length + dropped.length).toBe(exchanges.length);
  });
});
