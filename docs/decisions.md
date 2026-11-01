# Design decisions

One entry per real choice: what was decided, why, and what was rejected. Newest first.

## 2026-11-01: Read response bodies on click, for fetch and XHR rows only

**Decision:** The panel calls `getContent()` only when a `fetch` or `xhr` row is clicked, and shows the body on screen: JSON pretty-printed, other text as-is, binary not shown, and anything past 100,000 characters cut off. Only those rows' request objects are kept, in memory and capped like the rows. Bodies are never logged or stored.

**Why:** It is the smallest change that proves the extension can read API responses, which is the project's biggest risk. No raw bodies sit in memory before redaction exists (E2). Scripts, images, and fonts aren't API traffic, so their bodies aren't worth reading.

**Finding:** Chrome discards response bodies when the inspected page reloads. Clicking an older row then gets a `getContent()` callback with no arguments, and DevTools logs "Extension server error: Object not found". The panel shows "Body no longer available" and stops asking for that row. **Consequence for X1:** capture must read each body inside `onRequestFinished`, redact it, and only then keep it; reading on demand later will miss bodies.

**Testing note:** `onRequestFinished` only fires once the whole response body has arrived. A `fetch()` typed in the Console whose body is never read may never finish (seen with dummyjson.com), so it never reaches the panel. Read the body when testing by hand: `fetch(url).then(r => r.text())`. Real apps read their responses, so this doesn't affect capture.

**Rejected:** Reading every fetch/XHR body at capture time now, which survives reloads but holds unredacted bodies in memory before redaction exists; that is X1's job, together with E2. Making every row clickable, which mostly shows large HTML, JS, or binary bodies.

## 2026-11-01: Keep captured requests across page loads

**Decision:** The panel's request list keeps growing when the inspected page navigates or reloads. It holds the newest 1,000 rows and says when older ones were dropped. A Clear control comes with the capture controls in roadmap X1.

**Why:** Mapping an API needs traffic from many pages: a login redirect or a reload shouldn't wipe what was already captured. The cap keeps a long session from slowing the panel, and the summary line makes the cap visible instead of silently losing rows.

**Rejected:** Clearing on navigation (via `onNavigated`), like Chrome's Network panel does by default. That suits debugging one page, not building up a picture of a whole API.

## 2026-11-01: Listen for requests in the panel page, without backfill for now

**Decision:** The `onRequestFinished` listener runs in the panel page (`entrypoints/devtools-panel`), inside a React effect that removes it on cleanup. Requests made before the panel tab is first opened are not captured yet. Backfilling them with `getHAR()` is a follow-up.

**Why:** Rows go straight into React state with no messaging layer between pages. Chrome only loads the panel when its tab is first clicked, so the gap is real, but the empty-state hint tells users to reload, and `getHAR()` can close it later without moving the listener.

**Rejected:** Listening in the hidden DevTools page, which catches requests from the moment DevTools opens but needs a channel to hand rows to the panel. Adding `getHAR()` backfill now, which needs de-duplication against live events and would have made task 1.3 a three-step change.

## 2026-10-31: Build the DevTools panel with React via the WXT module, without Tailwind yet

**Decision:** The DevTools page (`entrypoints/devtools`) only registers a panel; the panel itself is a separate unlisted page (`entrypoints/devtools-panel`). React is wired in with `@wxt-dev/module-react`. Tailwind waits until the panel has real UI (task 1.3 or later). Task 1.2 lands in two steps: a plain-HTML panel first, then React.

**Why:** Chrome never shows the DevTools page, so the visible UI has to live in its own page. The WXT module configures Vite's React plugin and auto-imports in one line and tracks WXT upgrades. Registering the panel before adding React means a missing tab can only be a registration problem, not a build problem. An empty panel has nothing to style, so Tailwind would be setup with nothing to check it against.

**Rejected:** Adding `@vitejs/plugin-react` to the Vite config by hand, which does the same job with more config to maintain. Rendering UI in the DevTools page itself, which Chrome doesn't display.

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
