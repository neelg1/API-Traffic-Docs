import './App.css';
import { useMemo, useState } from 'react';
import { formatBody } from './formatBody';
import { MAX_ROWS, hasReadableBody, useRequestLog } from './useRequestLog';
import { type BodyState, useResponseBody } from './useResponseBody';

function summary(total: number): string {
  const count = `${total.toLocaleString()} ${total === 1 ? 'request' : 'requests'}`;
  return total > MAX_ROWS ? `${count} (showing newest ${MAX_ROWS.toLocaleString()})` : count;
}

// React escapes text content, so a body can never inject markup into the panel.
function BodyView({ state }: { state: BodyState }) {
  // The panel re-renders on every captured request; don't re-format a big body each time.
  const formatted = useMemo(
    () => (state.status === 'loaded' ? formatBody(state.content, state.encoding) : null),
    [state],
  );

  switch (state.status) {
    case 'idle':
      return null;
    case 'loading':
      return <p className="hint">Loading body…</p>;
    case 'unavailable':
      return (
        <p className="hint">Body no longer available. Chrome may discard it after the page reloads.</p>
      );
    case 'error':
      return <p className="hint">Couldn't read the body.</p>;
    case 'loaded':
      if (!formatted || formatted.kind === 'empty') return <p className="hint">Empty body.</p>;
      if (formatted.kind === 'binary') {
        return <p className="hint">Binary response, not shown.</p>;
      }
      return (
        <>
          {formatted.kind === 'text' && <p className="hint">Not JSON; shown as text.</p>}
          {formatted.truncatedFrom !== undefined && (
            <p className="hint">
              Showing the first {formatted.text.length.toLocaleString()} of{' '}
              {formatted.truncatedFrom.toLocaleString()} characters.
            </p>
          )}
          <pre>{formatted.text}</pre>
        </>
      );
  }
}

export function App() {
  const { rows, total, readBody } = useRequestLog();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const body = useResponseBody(selectedId, readBody);

  return (
    <main>
      <h1>APITrafficDocs</h1>
      {total === 0 ? (
        <p className="hint">
          No requests yet. Capture runs only while DevTools is open and starts when this tab is
          first opened, so reload the page to see its requests.
        </p>
      ) : (
        <>
          <p className="hint">{summary(total)}. Click a fetch or xhr row to see its response.</p>
          <div className={selectedId !== null ? 'split' : undefined}>
            <table>
              <colgroup>
                <col className="col-method" />
                <col className="col-status" />
                <col className="col-type" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const readable = hasReadableBody(row);
                  const classes = [
                    // Status 0 means the request failed or was blocked.
                    (row.status === 0 || row.status >= 400) && 'error',
                    readable && 'clickable',
                    row.id === selectedId && 'selected',
                  ].filter(Boolean);
                  return (
                    <tr
                      key={row.id}
                      className={classes.join(' ') || undefined}
                      onClick={readable ? () => setSelectedId(row.id) : undefined}
                    >
                      <td>{row.method}</td>
                      <td>{row.status === 0 ? 'failed' : row.status}</td>
                      <td>{row.type}</td>
                      <td title={row.url}>{row.url}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {selectedId !== null && (
              <section className="body">
                <div className="body-header">
                  <button type="button" onClick={() => setSelectedId(null)}>
                    Close
                  </button>
                </div>
                <BodyView state={body} />
              </section>
            )}
          </div>
        </>
      )}
    </main>
  );
}
