# Design decisions

One entry per real choice: what was decided, why, and what was rejected. Newest first.

## 2026-11-13: Run eval apps from a pinned clone, never vendored

**Decision:** Each eval app gets a folder under `eval/targets/<app>/` with a `run.sh`, a Compose override, synthetic settings, and a README. `run.sh up` clones the app at a pinned release and commit into a gitignored `src/` and fails if the tag points anywhere else. Only our wrapper files and the app's served spec (in `eval/ground-truth/`, with its version recorded in that folder's README) are committed. `down` also deletes the app's data, so every recording starts from the same empty state. CI never runs the apps: scoring uses committed recordings and specs. The first app is the Full Stack FastAPI Template 0.12.0 (`84c5a9e`), running only `db` and `backend` with migrations and the first superuser created on every start, since neither of the template's Compose files does that.

**Why:** Scores are only comparable against a fixed app version, and checking the commit catches a moved tag. Cloning on demand keeps thousands of third-party files out of the repo and its history. Synthetic settings in a committed `eval.env` are fine because they only exist inside local containers, and recordings of eval apps are allowed fixtures (CLAUDE.md). Wiping data on `down` makes re-recordings reproducible. Keeping Docker out of CI keeps CI fast and simple.

**Rejected:** A git submodule, which pins equally well but adds clone and update friction. Copying the app's source into the repo, which bloats history and mixes licenses. Using the template's `compose.override.yml`, which adds dev-only services (mailcatcher, a large Playwright image) and more ports.

## 2026-11-08: Require CI to pass before merging into main

**Decision:** GitHub branch protection on `main` requires the `check` job (`.github/workflows/ci.yml`) to pass, requires the branch to be up to date with `main`, applies to admins too, and blocks force pushes and deletion. No reviews are required. This lives in the repository settings, not in the code.

**Why:** CI that only reports can still be ignored; a required check can't. With no bypass for admins, every change, including docs-only edits, goes through a pull request. Reviews aren't required because the project has one developer.

**Rejected:** Reporting-only CI. Allowing admins to bypass the check. To switch it off temporarily (for example during a GitHub Actions outage), use Settings → Branches.

## 2026-11-08: Lint with ESLint on TypeScript 6 while the packages use TypeScript 7

**Decision:** ESLint with typescript-eslint, configured once at the repo root (`eslint.config.mjs`). The root has `typescript@6.0.3` only so typescript-eslint can parse code; the packages keep `typescript@7.0.2` for typechecking. Linting doesn't use type information. Lint rules back up two CLAUDE.md rules: `no-console` in the extension (rule 5), and a ban on clock and random reads in `packages/engine/src` (`Math.random`, `Date.now`, `new Date()` with no arguments, `Date()`) (rule 1). CI runs lint, typecheck, test, and the extension build on every pull request and push to `main`.

**Why:** typescript-eslint 8.72.1, including its pre-releases, supports TypeScript only below 6.1. A lint-only TypeScript 6 keeps the roadmap's ESLint plan without downgrading the code, and pnpm resolves each tool to the right copy (checked: typescript-eslint gets 6.0.3, both packages' `tsc` report 7.0.2). Untyped linting is faster and avoids running TypeScript 6's checker on TypeScript 7 code. The purity rules close the gaps the engine's tsconfig can't (standard JavaScript has `Math` and `Date`), while deterministic `Date.parse` and `new Date(value)` stay available for format detection. CI builds the extension because CLAUDE.md requires the build to pass after every step.

**Rejected:** Oxlint, which needs no TypeScript but departs from the roadmap and might not support every rule needed here. Downgrading every package to TypeScript 6, which undoes the 1.1 choice. Banning `Date` entirely, which would block deterministic date parsing. **Revisit** when typescript-eslint supports TypeScript 7: remove the root `typescript@6.0.3`.

## 2026-11-08: Enforce engine purity with the compiler; no engine build step yet

**Decision:** `packages/engine/tsconfig.json` includes only the standard JavaScript library (`lib: ["ES2024"]`, `types: []`): no DOM types and no Node types, so `fetch`, `document`, `chrome`, `fs`, and timers in `src/` fail typecheck. Tests have their own `test/tsconfig.json` with the same strict settings, so test-only types (Node, for reading HAR fixtures) never reach `src/`. The package exports `src/index.ts` directly, with no build step.

**Why:** Rule 1 (the engine is pure) is checked by a tool on every typecheck instead of relying on review. A probe confirmed `fetch`, `setTimeout`, and `document` are rejected. `Math.random()` and `Date` are standard JavaScript and can't be blocked this way; lint rules (task 1.6) are the place for those. Without a separate test config, type errors in tests would go unnoticed, since the main config only covers `src/`. Every current consumer (the extension via Vite, Vitest) reads TypeScript directly, so a build step would add work and no value yet.

**Rejected:** Including DOM or Node types and relying on code review, which is how purity rules erode. One tsconfig covering both `src/` and `test/`, which would let test-only Node types leak into `src/`. A compile step to `dist/` now; revisit when the CLI needs to run on plain Node.

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
