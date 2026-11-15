# Known ground-truth spec issues

Real specs are sometimes wrong or incomplete: a field the API always returns but the spec marks optional, an undocumented endpoint, a wrong type. When scoring finds a mismatch, check the actual traffic first. If the spec is wrong, record it here so it isn't counted as an engine failure.

One entry per issue:

```
## <app>: <METHOD> <path>, <short description>

- **Spec says:** ...
- **Traffic shows:** ... (recording file and request)
- **Scoring:** excluded | adjusted (how)
- **Found:** YYYY-MM-DD, task or PR
```

## fastapi-template: POST /api/v1/password-recovery-html-content/{email}, server crashes after responding

- **Spec says:** `200` with a `text/html` body (a preview of the password-recovery email; superuser only).
- **Traffic shows:** the server logs `200 OK`, then fails with `RuntimeError: Invalid HTTP header name.` and drops the connection, so the client only sees a network error. The endpoint sets a response header named `subject:`, and header names can't contain a colon (`backend/app/api/routes/login.py`, template 0.12.0; still present on upstream `master` as of 2026-11-13). The recording script doesn't call it.
- **Scoring:** excluded. It can never be exercised successfully, so count it neither against recall nor in coverage.
- **Found:** 2026-11-13, task 1.8.
