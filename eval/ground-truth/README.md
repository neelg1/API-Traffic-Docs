# Ground-truth specs

Each eval app's real OpenAPI spec: the answer key the scoring script (task 1.12) compares generated specs against. Files are saved exactly as each app serves them, only pretty-printed. Don't edit them by hand; record known errors in [`../known-spec-issues.md`](../known-spec-issues.md) instead.

| File | App | App version | Fetched from | Refresh with |
| --- | --- | --- | --- | --- |
| `fastapi-template.openapi.json` | [Full Stack FastAPI Template](../targets/fastapi-template/README.md) | 0.12.0 (`84c5a9e`) | `GET /api/v1/openapi.json` | `pnpm eval:fastapi up`, then `pnpm eval:fastapi spec` |

A spec's own `info.version` (for example `0.1.0` in the FastAPI template) is the app's label, not the release we run; the table above is the source of truth for versions.

## Notes per app

**fastapi-template:** 22 operations across `login`, `users`, `items`, and `utils`. Email is disabled in the eval setup (empty `SMTP_HOST`), so the password-recovery, reset-password, and test-email operations can't be fully exercised by a recording. Expect them to show up in coverage, not as engine errors.
