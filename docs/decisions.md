# Design decisions

One entry per real choice: what was decided, why, and what was rejected. Newest first.

## 2026-10-24: Split the project into an engine and an extension

**Decision:** All inference logic lives in a pure TypeScript package (`packages/engine`). The Chrome extension, CLI, and eval harness are thin wrappers that call it.

**Why:** The hard parts (URL patterns, schema merging, redaction) can be unit tested without loading an extension. The eval runs the exact same code users run. The CLI comes almost for free.

**Rejected:** Putting the logic inside the extension. Faster to start, but slow to test and impossible to evaluate in CI.
