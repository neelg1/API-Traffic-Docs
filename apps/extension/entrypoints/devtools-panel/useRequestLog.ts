import { useCallback, useEffect, useRef, useState } from 'react';
import { browser, type Browser } from 'wxt/browser';

export interface RequestRow {
  id: number;
  method: string;
  url: string;
  /** 0 when the request failed or was blocked before a response arrived. */
  status: number;
  /** Chrome's resource type (fetch, xhr, script, image, ...). */
  type: string;
}

export interface RawBody {
  /** null when Chrome no longer has the body (e.g. after the page navigated). */
  content: string | null;
  /** '' for plain text, 'base64' for binary content. */
  encoding: string;
}

export interface RequestLog {
  /** The newest rows, at most MAX_ROWS. */
  rows: RequestRow[];
  /** Every request seen since the panel opened, including dropped rows. */
  total: number;
  /** Reads a row's response body on demand; null if its request was dropped. */
  readBody: (id: number) => Promise<RawBody | null>;
}

// Oldest rows are dropped past this, so a long session can't slow the panel.
export const MAX_ROWS = 1000;

let nextId = 0;

/** Only fetch and XHR responses are API traffic worth reading (see docs/decisions.md). */
export function hasReadableBody(row: RequestRow): boolean {
  return row.type === 'fetch' || row.type === 'xhr';
}

// The callback form works on every Chrome version; the Promise form needs Chrome 151+.
function readContent(request: Browser.devtools.network.Request): Promise<RawBody> {
  return new Promise((resolve) => {
    // Once the page has reloaded, Chrome calls back with no arguments (and logs
    // "Object not found" in DevTools), despite the typings saying string.
    request.getContent((content, encoding) =>
      resolve({ content: content ?? null, encoding: encoding ?? '' }),
    );
  });
}

function toRow(request: Browser.devtools.network.Request): RequestRow {
  return {
    id: nextId++,
    method: request.request.method,
    url: request.request.url,
    status: request.response.status,
    type: request._resourceType ?? 'other',
  };
}

/**
 * Lists requests that finish while the panel is open. Rows live in memory
 * only; nothing is logged or stored (CLAUDE.md rules 4 and 5).
 */
export function useRequestLog(): RequestLog {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [total, setTotal] = useState(0);
  // Request objects for readable rows, so bodies can be read on click. Kept
  // out of React state: they're never rendered, only used to call getContent().
  const requests = useRef(new Map<number, Browser.devtools.network.Request>());

  useEffect(() => {
    const onFinished = (request: Browser.devtools.network.Request) => {
      const row = toRow(request);
      if (hasReadableBody(row)) {
        requests.current.set(row.id, request);
        if (requests.current.size > MAX_ROWS) {
          // Maps iterate in insertion order, so the first key is the oldest.
          const oldest = requests.current.keys().next().value;
          if (oldest !== undefined) requests.current.delete(oldest);
        }
      }
      setRows((prev) => [...prev.slice(-(MAX_ROWS - 1)), row]);
      setTotal((n) => n + 1);
    };
    browser.devtools.network.onRequestFinished.addListener(onFinished);
    return () => browser.devtools.network.onRequestFinished.removeListener(onFinished);
  }, []);

  const readBody = useCallback(async (id: number) => {
    const request = requests.current.get(id);
    if (!request) return null;
    const body = await readContent(request);
    // Chrome won't have it next time either, so forget the request rather
    // than asking again (and logging another error) on every click.
    if (body.content === null) requests.current.delete(id);
    return body;
  }, []);

  return { rows, total, readBody };
}
