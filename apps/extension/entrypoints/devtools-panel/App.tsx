import './App.css';
import { MAX_ROWS, useRequestLog } from './useRequestLog';

function summary(total: number): string {
  const count = `${total.toLocaleString()} ${total === 1 ? 'request' : 'requests'}`;
  return total > MAX_ROWS ? `${count} (showing newest ${MAX_ROWS.toLocaleString()})` : count;
}

export function App() {
  const { rows, total } = useRequestLog();

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
          <p className="hint">{summary(total)}</p>
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
              {rows.map((row) => (
                // Status 0 means the request failed or was blocked.
                <tr key={row.id} className={row.status === 0 || row.status >= 400 ? 'error' : undefined}>
                  <td>{row.method}</td>
                  <td>{row.status === 0 ? 'failed' : row.status}</td>
                  <td>{row.type}</td>
                  <td title={row.url}>{row.url}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
