import { useEffect, useState } from 'react';
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

export interface RequestLog {
  /** The newest rows, at most MAX_ROWS. */
  rows: RequestRow[];
  /** Every request seen since the panel opened, including dropped rows. */
  total: number;
}

// Oldest rows are dropped past this, so a long session can't slow the panel.
export const MAX_ROWS = 1000;

let nextId = 0;

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

  useEffect(() => {
    const onFinished = (request: Browser.devtools.network.Request) => {
      const row = toRow(request);
      setRows((prev) => [...prev.slice(-(MAX_ROWS - 1)), row]);
      setTotal((n) => n + 1);
    };
    browser.devtools.network.onRequestFinished.addListener(onFinished);
    return () => browser.devtools.network.onRequestFinished.removeListener(onFinished);
  }, []);

  return { rows, total };
}
