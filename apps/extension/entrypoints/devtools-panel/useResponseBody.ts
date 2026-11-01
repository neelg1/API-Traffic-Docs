import { useEffect, useState } from 'react';
import type { RawBody } from './useRequestLog';

export type BodyState =
  | { status: 'idle' }
  | { status: 'loading' }
  /** Chrome no longer has the body, or the row's request was dropped. */
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'loaded'; content: string; encoding: string };

/**
 * Reads the selected row's response body. The body is shown on screen only;
 * it is never logged (CLAUDE.md rule 5), so errors carry no body content.
 */
export function useResponseBody(
  id: number | null,
  readBody: (id: number) => Promise<RawBody | null>,
): BodyState {
  // Tagged with the id it belongs to, so a slow read for an old selection
  // can't show up under a newer one.
  const [result, setResult] = useState<{ id: number; state: BodyState } | null>(null);

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    readBody(id).then(
      (body) => {
        if (cancelled) return;
        const state: BodyState =
          body && body.content !== null
            ? { status: 'loaded', content: body.content, encoding: body.encoding }
            : { status: 'unavailable' };
        setResult({ id, state });
      },
      () => {
        if (!cancelled) setResult({ id, state: { status: 'error' } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, readBody]);

  if (id === null) return { status: 'idle' };
  return result?.id === id ? result.state : { status: 'loading' };
}
