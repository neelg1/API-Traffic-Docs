# Design decisions

One entry per real choice: what was decided, why, and what was rejected. Newest first.

## 2026-10-31: Name the project APITrafficDocs

**Decision:** The display name is `APITrafficDocs` (store title, DevTools tab, README). Package, CLI, and repo identifiers use `api-traffic-docs`. The Chrome Web Store title is "APITrafficDocs – OpenAPI docs from your browser's API traffic".

**Why:** No conflicts for "apitrafficdocs" on GitHub or the Chrome Web Store. One joined word is distinctive and searchable, while the store title's subtitle carries the plain-English description. It matches the existing repo and package names, so nothing needs renaming. It is short enough for a DevTools tab.

**Rejected:** "API Traffic Docs" with spaces, which reads slightly easier but is a generic phrase that is hard to search for. Names containing "OpenAPI" or "Swagger", which are other organizations' trademarks.

## 2026-10-31: Hand-write a minimal WXT scaffold

**Decision:** `apps/extension` was written by hand with only a DevTools page entrypoint, no permissions, and only `wxt` and `typescript` as dependencies (exact versions). React is added in task 1.2, when there is a panel to render.

**Why:** Every file in the scaffold is one we keep, so the first diff is small enough to review. The DevTools page is the entrypoint the extension actually needs; an empty permission list keeps store review simple (roadmap X4).

**Rejected:** `wxt init`, which generates a popup, content script, background script, and sample assets that would all be deleted. A placeholder background script, which WXT would accept but the extension doesn't use.

## 2026-10-24: Split the project into an engine and an extension

**Decision:** All inference logic lives in a pure TypeScript package (`packages/engine`). The Chrome extension, CLI, and eval harness are thin wrappers that call it.

**Why:** The hard parts (URL patterns, schema merging, redaction) can be unit tested without loading an extension. The eval runs the exact same code users run. The CLI comes almost for free.

**Rejected:** Putting the logic inside the extension. Faster to start, but slow to test and impossible to evaluate in CI.
