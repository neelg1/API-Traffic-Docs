# APITrafficDocs: Roadmap

_Last updated: Oct 31, 2026. Update it when the plan changes._

Build a Chrome extension backed by a standalone TypeScript engine that turns live browser API traffic into OpenAPI documentation. Target: a measured, working MVP by week 6 and a public launch by week 12.

## Goals and success criteria

Every milestone should leave something usable and measurable: a working tool, an honest number, or a published result.

**Primary goals:**

1. A public, working tool other developers install and use
2. One hard, honest accuracy number from a repeatable evaluation
3. Privacy-safe by design: secrets redacted at capture time, AI sees schemas only

**Done at week 6 (MVP):**

- [ ] Engine turns a HAR file into a valid OpenAPI 3.1 spec
- [ ] Extension captures traffic from a live tab and exports the spec
- [ ] Redaction runs before anything is stored or sent to an LLM
- [ ] Evaluation runs on at least 3 apps and produces a baseline endpoint and field accuracy
- [ ] Public GitHub repo with README, demo GIF, and the accuracy table

**Done at week 12 (launched and polished):**

- [ ] Published on the Chrome Web Store
- [ ] Accuracy improved over baseline, with a before/after table
- [ ] AI descriptions and grouping, with their impact measured
- [ ] Spec diffing between two recordings
- [ ] Write-up posted, with first users and installs tracked
- [ ] Optional: small backend for saved specs and version history

**Not goals:** revenue, perfect coverage of every web app, or supporting every browser.

## Scope

v1 handles REST APIs that speak JSON, captured in Chrome by one user. Anything outside that waits until v1 is measured and launched.

| Area | In v1 | Stretch (weeks 9–12 if ahead) | Out |
| --- | --- | --- | --- |
| Browser | Chrome (Manifest V3), DevTools panel | Edge (same engine, little extra work) | Firefox, Safari |
| API styles | REST over HTTP, JSON bodies | Form-encoded bodies, simple query-string APIs | GraphQL, gRPC-web, WebSockets, server-sent events |
| Inputs | Live capture; HAR file import | CLI that reads HAR files | Proxy or mobile app capture |
| Output | OpenAPI 3.1 JSON and YAML, built-in docs viewer | TypeScript types, Postman collection | Generated client SDKs in many languages |
| AI | Endpoint names, summaries, field descriptions, grouping into tags | Detecting auth schemes and pagination patterns | Chat with your API |
| Users | One person, local storage | Saved specs and version history via a small backend | Teams, sharing, permissions, billing |
| Changes | — | Diff between two recordings | Continuous monitoring in production |

**Rules for scope creep:** a new feature only enters if it improves the accuracy number or fixes something a real user reported. Anything else goes on a "later" list in the repo.

## Architecture

The extension, CLI, and evaluation harness are thin wrappers around one engine, so every improvement shows up everywhere and is measured the same way.

```
  Chrome extension            CLI                    Evaluation harness
  (captures fetch/XHR in      (reads HAR files,      (replays HAR fixtures,
   DevTools; redacts, then     prints or saves        compares against
   stores locally)             the spec)              real specs)
         │                      │                       │
         └──────────────────────┼───────────────────────┘
                                ▼
  ┌──────────────────── Core engine (packages/engine) ────────────────────┐
  │ 1. Ingest and filter   Parse HAR entries; keep fetch/XHR with JSON    │
  │ 2. Redact  (key step)  Strip tokens, cookies, emails, IDs before      │
  │                        storage or any AI call                         │
  │ 3. Group endpoints     /users/481 + /users/92 -> GET /users/{id}      │
  │ 4. Infer schemas       Merge samples: types, optional fields, enums   │
  │ 5. Build OpenAPI       Emit OpenAPI 3.1 with examples, JSON or YAML   │
  │ 6. Enrich with AI      (optional) Names, summaries, tags;             │
  │                        sees redacted schemas only                     │
  └───────────────────────────────────────────────────────────────────────┘
                                │
         ┌──────────────────────┼───────────────────────┐
         ▼                      ▼                       ▼
  OpenAPI spec             Accuracy report         Backend (phase 2, optional)
  (JSON/YAML export,       (endpoint and field     (saved specs, version
   built-in docs viewer)    scores per app)          diffs, accounts, AI proxy)
```

Optional pieces are marked as such. The engine is a plain TypeScript library with no browser or network dependencies, which keeps it fast to unit test.

**Key design decisions:**

- **Engine is pure and deterministic.** Same HAR in, same spec out. AI enrichment is a separate, optional step, so the evaluation can score the engine with and without AI.
- **Redaction lives in the engine, called at capture time.** The extension redacts each request before writing it to storage, so raw secrets never persist.
- **AI sees schemas, not data.** The enrichment step receives endpoint paths, field names, and types, never real values.
- **v1 has no server.** The user supplies their own LLM API key, stored locally. A backend proxy comes in phase 2 only if needed.
- **Incremental by design.** The engine can merge new traffic into an existing spec, so recording more pages improves the docs instead of starting over.

## Repo structure and tech stack

One public monorepo, TypeScript end to end, with the engine as its own package so every app imports the same code.

```
api-traffic-docs/
├── packages/
│   └── engine/            # pure TS library: ingest, redact, group, infer, build, enrich
│       ├── src/
│       └── test/          # unit tests + HAR fixtures
├── apps/
│   ├── extension/         # WXT project: DevTools panel, storage, UI
│   └── cli/               # `atd generate recording.har -o openapi.yaml`
├── eval/
│   ├── targets/           # docker-compose files for each test app
│   ├── recordings/        # HAR files captured from each app
│   ├── ground-truth/      # each app's real OpenAPI spec
│   └── score.ts           # compares generated vs real, writes a report
├── docs/                  # design notes, decision log, write-up drafts
└── .github/workflows/     # CI: lint, test, eval on every PR
```

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict mode) | Runs in the extension, the CLI, and Node; strong typing for schema code |
| Monorepo | pnpm workspaces | Simple, fast, no extra build orchestration needed at this size |
| Extension framework | [WXT](https://github.com/wxt-dev/wxt) | Vite-based, generates the Manifest V3 file, hot reload for DevTools pages |
| Panel UI | React + Tailwind | Familiar and well supported; keep the UI plain |
| Local storage | IndexedDB via a small wrapper (e.g. `idb`) | Holds thousands of captured requests; `chrome.storage` has tight size limits |
| Schema inference | A custom merger, with GenSON-style behavior as the reference | The merge rules are the core of the project; an existing library is the baseline to beat |
| OpenAPI output | Typed builder (e.g. `openapi3-ts`) + YAML serializer | Avoids hand-building nested JSON |
| Docs viewer | Embedded open-source viewer (Swagger UI, Redoc, or Scalar) | No need to build a renderer |
| Spec validation | An OpenAPI validator in tests | Every generated spec must be valid |
| LLM | One provider SDK behind a small interface | Easy to swap models and to mock in tests |
| Tests | Vitest | Fast, Vite-native, works with the engine and the extension |
| CI | GitHub Actions | Runs tests and the eval on every PR |

**Habits from day one:** conventional commits, a `docs/decisions.md` log of design choices and why, and an issue per task so the GitHub history tells the story.

## Engine workstreams

The engine is where the hard work lives. Build it in this order; each step has a clear "done when" so progress is never vague.

**One design choice shapes everything:** the engine stores *observations*, not raw traffic. For each endpoint it keeps aggregated evidence (how often each field appeared, its types, formats, value counts for short strings). Specs are built from observations, which makes incremental merging cheap and means raw values never need to persist.

### E1. Ingest and filter

**What it does:** turns HAR entries into clean, typed `Exchange` objects and throws away noise.

**How to build it:**

1. Define the internal type: method, parsed URL, status, request and response headers, query params, parsed request body, parsed response body, content types.
2. Parse bodies by content type. JSON first; response bodies may arrive base64-encoded, so decode based on the HAR `encoding` field.
3. Filter out:
   - static assets (scripts, images, fonts, CSS) and page navigations
   - CORS preflight `OPTIONS` requests and failed requests (status 0)
   - known analytics and error-tracking hosts (a denylist: Google Analytics, Segment, Sentry, Datadog, and similar)
   - non-JSON responses (v1)
4. Group by origin and let the user pick which API hosts to document.
5. Cap body size (e.g. skip bodies over 1 MB, or sample large arrays) so huge payloads can't freeze the panel.

**Done when:** fixtures from every eval app parse with zero crashes, and filtered output contains only API calls.

**Watch out:** apps that send JSON as `text/plain`; sniff the body as a fallback.

### E2. Redact

**What it does:** removes secrets and personal data before anything is stored or sent anywhere, while keeping enough signal for schema inference.

**How to build it:**

1. **Headers:** keep the header name, replace the value, for `Authorization`, `Cookie`, `Set-Cookie`, and any header whose name matches token, secret, key, auth, or session. Keeping the name lets the spec still document the auth scheme.
2. **Query params and body fields by name:** password, token, secret, apiKey, ssn, card, cvv, and a user-extendable list.
3. **Values by pattern:** emails, JWTs (strings starting `eyJ`), card numbers (Luhn check), phone numbers, long high-randomness strings (entropy check).
4. **Extract features, then discard values.** Before dropping a value, record its features: type, length, detected format (email, uuid, date-time, uri). Keep the raw value only if it is short, low-randomness, and repeats (an enum candidate like `"admin"` or `"pending"`).
5. **Synthetic examples:** the generated spec uses invented example values, never captured ones.
6. **User controls:** custom rules and a preview showing what will be redacted.

**Done when:** a leak test passes in CI. Plant 50+ fake secrets across fixtures, run the full pipeline, and assert none of them appear anywhere in the output, storage, or AI prompts.

**Watch out:** over-redaction. If every string is replaced, enum and format detection die. The feature-extraction step is what balances privacy and quality.

### E3. Group endpoints (URL patterns)

**What it does:** recognizes that `/users/481` and `/users/92` are one endpoint, `GET /users/{userId}`, while `/users/me` is its own endpoint.

**How to build it:**

1. Split each path into segments and build a tree per host and method.
2. Classify each segment:
   - obvious parameters: integers, UUIDs, ULIDs, long hex strings, dates, long mixed letter-and-digit tokens
   - obvious literals: dictionary words, version markers (`v1`), short lowercase words
3. For ambiguous segments (slugs like `acme-corp`), use structure: at a tree node, if many distinct sibling values share the same subtree shape, collapse them into one parameter. A literal like `me` or `search` usually has a different subtree or response shape.
4. Name parameters from the previous segment, singularized: `/users/{userId}`, `/orders/{orderId}`.
5. Query params: collect names and types; mark required only if present in every sample.
6. Make the collapse threshold configurable, and let users manually merge or split endpoints in the UI.

**Done when:** endpoint precision and recall on the eval apps reach a target set after the baseline (e.g. 90%).

**Watch out:** this is the step most likely to eat unlimited time. Set the target, hit it, move on.

### E4. Infer and merge schemas

**What it does:** turns many response samples into one accurate schema per endpoint and status code.

**How to build it:**

1. Infer a schema from one JSON value: type, properties, array items.
2. Merge schemas from many samples:
   - field required only if present in every sample (track presence counts)
   - `nullable` when `null` was seen
   - integer versus number; string formats from the features recorded in E2
   - enums only when distinct values are few, short, and seen many times (never for IDs or names)
3. Detect dictionary-style objects whose keys are data (dates, IDs) and model them as `additionalProperties`, not hundreds of fields.
4. Detect polymorphic arrays (items with a `type` or `kind` field and different shapes) and model them as `oneOf` with a discriminator.
5. Keep separate schemas per status code, so error responses are documented too.
6. Do the same for request bodies.
7. **Shared models:** hash schema structures so an identical `User` object appearing in ten responses becomes one reusable component referenced everywhere.

**Done when:** field-level precision and recall hit the target on the eval apps, and shared components are extracted.

**Watch out:** the custom merger is the point. Use an existing inference library only as a baseline to compare against.

### E5. Build the OpenAPI spec

**What it does:** turns grouped endpoints and schemas into a valid OpenAPI 3.1 document.

**How to build it:**

1. Map each endpoint to a path and operation with an `operationId`, parameters (path, query, notable headers), request body, and responses by status code.
2. Put shared models under `components/schemas` and reference them.
3. Infer security schemes from what E2 saw: Bearer tokens, Basic auth, API key headers, cookies.
4. Set `servers` from the observed origins.
5. Export JSON and YAML; validate every output in tests.
6. Support incremental updates: new observations merge into the existing state, and the spec is rebuilt.

**Done when:** every generated spec passes validation and renders correctly in the docs viewer.

### E6. Enrich with AI

**What it does:** adds the human parts: endpoint summaries, descriptions, readable operation IDs, better parameter names, and groupings into tags like "Scheduling" or "Users."

**How to build it:**

1. Send a compact summary per endpoint: method, path template, parameter names, field names and types, status codes. Never values.
2. Batch related endpoints in one prompt for context, and request structured JSON output with a defined schema.
3. Validate the response. AI may only change text fields (names, summaries, descriptions, tags), never paths, types, or structure.
4. Cache results by a hash of each endpoint's summary so re-runs are nearly free.
5. Track tokens and cost per run and show them in the UI.
6. Fall back to deterministic names if the AI call fails or is turned off.
7. v1 uses the user's own API key, stored locally.

**Done when:** a scored sample of 30 endpoints shows most AI descriptions rated accurate, and cost per 100 endpoints is known.

**Watch out:** confident but wrong descriptions. Prompt it to say "unclear" rather than guess, and measure how often it is wrong.

### E7. Spec diff (stretch)

**What it does:** compares two recordings and reports added or removed endpoints, added or removed fields, type changes, and fields that became required.

**How to build it:** walk both specs in parallel, classify each change as breaking or non-breaking, and render a readable report. Open-source diff tools exist; use one as a reference to check results.

**Done when:** diffing two versions of an eval app (for example, before and after a release) produces a correct change list.

## Extension workstream

The extension is a thin shell: capture, store, show, export. All intelligence comes from the engine package.

### X1. Capture (de-risk this first)

Chrome's [devtools.network API](https://developer.chrome.com/docs/extensions/reference/api/devtools/network) fires `onRequestFinished` with a HAR entry for each completed request, and the request's `getContent()` returns the response body. `getHAR()` returns everything the Network panel currently knows about. The manifest needs a `devtools_page` entry.

**How to build it:**

1. Register a DevTools panel named after the project.
2. On panel open, call `getHAR()` to pick up requests already made, then listen to `onRequestFinished` for new ones.
3. For each request: check it against E1's filters, fetch the body with `getContent()`, run E2 redaction, and only then store it.
4. Show a live counter ("142 requests captured, 38 endpoints") so users see it working.
5. Add Start, Pause, and Clear controls, and a "preserve across page loads" toggle.

**Known limits to design around:**

- Capture only happens while DevTools is open. That is fine for a developer audience; say so clearly in the UI and README.
- Requests made before DevTools opened may be missing; prompt the user to reload the page.
- Response bodies are discarded when the inspected page reloads: `getContent()` then calls back with no arguments and DevTools logs "Object not found". Read bodies inside `onRequestFinished`, not later on demand (found in task 1.4).
- The alternative, Chrome's debugger API, works without DevTools open but shows users a warning banner and needs scarier permissions. Keep it out of v1.

**Done when (week 1 spike):** a bare panel logs method, URL, status, and the parsed response body of every fetch/XHR call on a test app.

### X2. Storage

1. Store per-session observations (from E2 and E3) in IndexedDB, keyed by recording session and host.
2. Write continuously, not on close: the panel's page dies when DevTools closes.
3. Keep a capped buffer of recent redacted samples for debugging, with a size limit and "clear all data" button.
4. Store user settings (redaction rules, selected hosts, API key) separately, with the API key never included in exports.

### X3. Panel UI

Keep it plain and fast; this is not where the project is judged.

1. **Hosts view:** detected API hosts with request counts; checkboxes to include or exclude.
2. **Endpoints view:** table of method, path template, sample count, status codes, and a confidence indicator.
3. **Endpoint detail:** parameters, request and response schemas, redaction notices, and controls to merge or split endpoints or rename parameters.
4. **Docs view:** the embedded docs viewer rendering the current spec.
5. **Export:** download OpenAPI YAML or JSON; copy to clipboard; import or export a HAR file.
6. **AI panel:** enter an API key, run enrichment, see cost per run.

### X4. Permissions and privacy

1. Request the smallest permission set possible; every extra permission slows store review and scares users.
2. Nothing leaves the machine except optional AI calls, and those carry only schemas. State this in the store listing.
3. Write a short privacy policy (required for the store listing when handling user data).
4. Add a first-run screen explaining what is captured, what is redacted, and that everything stays local.

### X5. Packaging

1. WXT builds and zips the extension for upload.
2. Version with semantic versioning and keep a changelog.
3. Test on a fresh Chrome profile before every release.

## Evaluation harness

The evaluation turns "it seems to work" into numbers. It runs real open-source apps whose correct API specs are known, records traffic, and scores the generated spec against the real one.

### Target apps

| App | Stack | Where the real spec lives | Role |
| --- | --- | --- | --- |
| [Full Stack FastAPI Template](https://github.com/fastapi/full-stack-fastapi-template) | FastAPI + React | Served by the backend at `/api/v1/openapi.json` | Easy start: small, clean API |
| [Mealie](https://providers.apievangelist.com/providers/mealie/) (recipe manager) | FastAPI + Vue | Served at `/openapi.json` (OpenAPI 3.1) | Medium: many endpoints, pagination, filtering |
| [Immich](https://docs.immich.app/api) (photo library) | NestJS + Svelte | `open-api/immich-openapi-specs.json` in the repo | Hard mode: large API, different backend framework; heavier to run |
| A custom "tricky" fixture app | Anything quick | Written for this project | Deliberately nasty cases: slugs, polymorphic arrays, dictionary objects, odd content types |

Start with the first two in week 1. Add Immich and the tricky app once the baseline exists.

### Recording protocol

1. Run each app with Docker Compose from `eval/targets/`, seeded with sample data.
2. Write a scripted walkthrough per app: create, view, edit, delete, search, paginate, and trigger at least two errors (a 404 and a validation error).
3. Automate it with Playwright, which can record a HAR file while it clicks through, so recordings are reproducible and can be regenerated when an app updates.
4. Commit the HAR files to `eval/recordings/` with the app version noted.

### Metrics

| Metric | Definition |
| --- | --- |
| Endpoint precision | Generated endpoints that match a real one, divided by all generated endpoints |
| Endpoint recall | Matched endpoints divided by real endpoints *the recording actually exercised* |
| Coverage (reported separately) | Real endpoints exercised by the recording, divided by all real endpoints |
| Field precision and recall | Over flattened field paths (e.g. `items[].owner.id`) for each matched endpoint and status code |
| Type accuracy | Matched fields whose inferred type and format agree with the real spec |
| Required accuracy | Matched fields whose required or optional status agrees |
| Parameter accuracy | Path and query parameters found and typed correctly |
| Leak count | Planted secrets found anywhere in output; must always be 0 |
| AI quality (later) | Rubric score on 30 sampled endpoints: accurate, vague, or wrong |
| Cost and time | Tokens, dollars, and seconds per run |

**Matching rule:** two endpoints match when the method agrees and the path templates are equivalent, ignoring parameter names (`/users/{id}` matches `/users/{userId}`).

### Scoring script

1. `eval/score.ts` runs the engine on each recording, loads the real spec, matches endpoints, and computes every metric above.
2. It writes a Markdown report with one table per app plus a summary, saved to the repo.
3. CI runs it on every pull request and comments the change versus the main branch, so every improvement or regression is visible.
4. Keep a `known-spec-issues.md` list: real specs are sometimes wrong or incomplete, so investigate mismatches before counting them as failures.

**Done when:** one command produces a report with all metrics for all target apps, and the first baseline is recorded in `docs/results.md`.

## Backend (phase 2)

Build the backend only if the MVP is measured and submitted to the store by week 8, using the holiday buffer weeks. It adds the strongest backend talking points: auth, versioned storage, and a secure AI proxy.

**Features, in priority order:**

1. **Sign in with GitHub (OAuth).** Developers already have accounts.
2. **Saved specs with version history.** Each upload creates an immutable version, deduplicated by a content hash.
3. **Shareable read-only docs links.** A public URL rendering a saved spec, which is useful for teams and great for demos.
4. **Version diffs.** The engine's E7 diff, run server-side between any two versions.
5. **AI proxy.** The server holds the model API key, so users don't need their own. It enforces per-user quotas and rate limits, caches results, and re-runs redaction on every request as a second line of defense.

**Suggested stack:** TypeScript (Fastify or Hono) so the server reuses the engine package directly, Postgres with the spec stored as JSONB, and a simple host like Fly.io or Railway.

**Data model (starting point):**

| Table | Key columns |
| --- | --- |
| users | id, github\_id, created\_at |
| projects | id, user\_id, name, api\_host |
| spec\_versions | id, project\_id, content\_hash, spec (JSONB), endpoint\_count, created\_at |
| share\_links | id, spec\_version\_id, slug, revoked\_at |
| ai\_usage | id, user\_id, tokens, cost, created\_at |

**Engineering details worth doing properly:**

- **Idempotent uploads:** the extension sends a client-generated ID, so a retried upload never creates a duplicate version.
- **Audit log:** who uploaded, shared, or deleted what, and when.
- **Data deletion:** one call deletes a user and everything they own.
- **Dogfooding:** generate the backend's own API docs with the extension, and say so in the README.

## Testing and quality strategy

The engine carries the weight of the project, so it gets the most testing. The extension gets enough to catch breakage, not more.

| Layer | What to test | How |
| --- | --- | --- |
| Engine units | Segment classification, schema merging rules, redaction patterns, OpenAPI mapping | Vitest; small hand-written inputs per rule; aim for high coverage here |
| Engine properties | Merging is order-independent; adding a sample never removes a field; output is always a valid spec | Property-based tests (e.g. fast-check) on generated JSON |
| Engine snapshots | Full HAR → spec output for each fixture | Snapshot tests; review every snapshot change in PRs |
| Privacy | No planted secret survives the pipeline | The leak test from E2, run in CI on every PR |
| Accuracy | No metric drops versus main | The eval harness, run in CI with a results comment |
| AI step | Output parses, respects the schema, changes only text fields | Recorded model responses replayed in tests; one live smoke test run manually |
| Extension | Panel loads, captures, stores, exports | A Playwright test against a local test page with the built extension loaded |
| Performance | Engine handles 5,000 requests without freezing the panel | A benchmark script; move heavy work to a web worker if needed |

**Habits:** every bug found in a real app becomes a fixture and a failing test before it is fixed. Over 12 weeks that builds a strong regression suite.

## Development workflow (Claude Code in VS Code)

Work in the repo with Claude Code, one issue per session, planned before coded, with tests and the eval as the referee. The core algorithms are written by hand; Claude helps with tests, fixtures, review, and plumbing.

### One-time setup

1. Keep this roadmap in `docs/ROADMAP.md`.
2. Add the short `CLAUDE.md` at the repo root with stable rules: stack, commands, architecture rules, scope, and who writes what. Keep the plan out of it; it points to `docs/ROADMAP.md` instead.
3. Create `docs/decisions.md` (design choices and why) and `docs/results.md` (eval numbers over time).
4. Turn each phase checklist into GitHub issues, with one milestone per phase.

### Per-task loop

1. Pick one issue and start a fresh Claude Code session.
2. Use plan mode: Claude reads the relevant code and the matching section of `docs/ROADMAP.md`, asks questions, and proposes a plan. Edit the plan before any code is written.
3. For engine work, write the failing test first.
4. Implement in small steps: Claude does one step (a few files, roughly under 150 changed lines), stops, explains what changed and how to check it, and waits for a go-ahead. Read every diff. A change that can't be explained doesn't get merged.
5. Run the tests, plus the eval for anything touching inference, and compare against main.
6. Commit with a message referencing the issue, add a `docs/decisions.md` entry if a real choice was made, and close the issue.
7. If a session gets long or starts drifting, end it and start fresh; `CLAUDE.md` carries the rules over.

### Who writes what

| Area | Written by hand | Claude's role |
| --- | --- | --- |
| E2 redaction design | Rules, feature extraction, privacy decisions | Pattern lists, planted-secret fixtures, leak test, review |
| E3 URL pattern inference | The algorithm and thresholds | Edge-case fixtures, tests, review |
| E4 schema merging | The merge rules and component extraction | Unit and property-based tests, review |
| E6 AI enrichment | Prompt design and the quality rubric | Plumbing: client, caching, validation, cost tracking |
| Eval metrics | Metric definitions and matching rule | Scoring script implementation, report formatting |
| Repo setup, CI, WXT, panel UI, Playwright scripts, OpenAPI plumbing, backend CRUD | Review and approve | Drafts most of it |

**Ground rules:**

- Never paste real captured traffic, secrets, or anything from other systems into prompts or fixtures.
- Update `CLAUDE.md` whenever a convention changes, so new sessions start with the right rules.

## Timeline

Six two-week phases, each ending in a gate. Weeks 5, 9, and 10 fall on Thanksgiving and the winter holidays, so they are planned light, and the public launch waits until after New Year's, when developer audiences are back.

| Phase | Weeks | Dates | Focus | Gate |
| --- | --- | --- | --- | --- |
| 1. Foundations | 1–2 | Oct 26 – Nov 8 | Capture spike, repo, CI, eval apps and recordings, engine v0, scoring script | Baseline accuracy number |
| 2. Core engine | 3–4 | Nov 9 – Nov 22 | Redaction and leak test, URL patterns, schema merging, OpenAPI export | Field accuracy measured on both apps |
| **3. MVP** | 5–6 | Nov 23 – Dec 6 | Panel UI, storage, export, AI enrichment v1 (week 5 light: Thanksgiving) | **MVP done, beta starts** |
| 4. Harden | 7–8 | Dec 7 – Dec 20 | Fix beta feedback, accuracy push, harder apps, store listing | Store submission in |
| 5. Holiday buffer | 9–10 | Dec 21 – Jan 3 | Light weeks: README, demo GIF, write-up, spec diff (stretch) | Launch kit ready |
| **6. Launch** | 11–12 | Jan 4 – Jan 17 | Show HN, Reddit, LinkedIn; answer feedback; publish final numbers | **Public launch** |

If a phase runs over, cut scope from the stretch items rather than sliding every later date.

### Working in small pieces

Every task below should fit in one sitting (about 1–2 hours) and end with something you can see or run: a passing test, a visible panel, a number. Each task becomes one GitHub issue and one small pull request.

- **Phases 0 and 1 are broken down in full below.** Do them in order; each builds on the last.
- **Phases 2–6 are listed at checklist level.** On the first day of each phase, spend one planning session splitting that phase's checklist into tasks of the same size, using what was learned so far.
- **If a task takes more than one sitting,** stop and split it rather than pushing through one big change.

### Phase 0: Setup (Oct 24–25)

- [x] **0.1 Name it.** Pick a project name; check the Chrome Web Store and GitHub for conflicts. *Done when:* name chosen. (30 min) Chosen: `APITrafficDocs` (see `docs/decisions.md`).
- [x] **0.2 Create the repo.** Public GitHub repo with README stub (one-line pitch, v1 scope), MIT license, Node `.gitignore`. *Done when:* repo exists and clones. (30 min)
- [x] **0.3 Workspace skeleton.** Root `package.json`, `pnpm-workspace.yaml`, empty `packages/engine`, `apps/extension`, `apps/cli`, `eval/`, `docs/`. *Done when:* `pnpm install` succeeds. (45 min)
- [x] **0.4 Add the docs.** `CLAUDE.md` at the root, `docs/ROADMAP.md`, empty `docs/decisions.md` and `docs/results.md`. *Done when:* committed. (15 min)

### Phase 1: Foundations (weeks 1–2, Oct 26 – Nov 8)

**Week 1: prove capture works, set up the engine**

- [x] **1.1 Extension scaffold.** ([#1](https://github.com/neelg1/API-Traffic-Docs/issues/1)) Create the WXT project in `apps/extension`. *Done when:* it loads in Chrome as an unpacked extension with no errors.
- [x] **1.2 Empty DevTools panel.** ([#2](https://github.com/neelg1/API-Traffic-Docs/issues/2)) Register a panel that just shows the project name, rendered with React (`react`, `react-dom`, `@wxt-dev/module-react`; deferred from 1.1 to keep the scaffold bare). Tailwind is deferred until the panel has real UI. Two steps: plain-HTML panel, then React (see `docs/decisions.md`). *Done when:* the tab appears in DevTools on any page.
- [x] **1.3 Log requests.** ([#3](https://github.com/neelg1/API-Traffic-Docs/issues/3)) Listen to `onRequestFinished` and list method, URL, and status in the panel. The listener runs in the panel and rows persist across page loads; `getHAR()` backfill and a Clear control come with X1 (see `docs/decisions.md`). *Done when:* browsing a site fills the list.
- [x] **1.4 Read response bodies.** ([#4](https://github.com/neelg1/API-Traffic-Docs/issues/4)) For fetch/XHR calls, fetch the body with `getContent()` and show parsed JSON when clicked. Bodies don't survive a page reload, so X1 must read them at capture time (see `docs/decisions.md`). *Done when:* a JSON response is readable in the panel. **This de-risks the whole project.**
- [ ] **1.5 Engine package setup.** ([#5](https://github.com/neelg1/API-Traffic-Docs/issues/5)) TypeScript strict mode and Vitest in `packages/engine`, with one placeholder test. *Done when:* `pnpm --filter engine test` passes.
- [ ] **1.6 Lint, typecheck, CI.** ([#6](https://github.com/neelg1/API-Traffic-Docs/issues/6)) ESLint, `tsc --noEmit`, and a GitHub Actions workflow running them plus tests. *Done when:* a pull request shows a green check.

**Week 2: first eval app, engine v0, first number**

- [ ] **1.7 Run eval app 1.** ([#7](https://github.com/neelg1/API-Traffic-Docs/issues/7)) Full Stack FastAPI Template via Docker Compose from `eval/targets/`. Save its `openapi.json` to `eval/ground-truth/`. *Done when:* the app runs locally and the spec file is committed.
- [ ] **1.8 Record app 1.** ([#8](https://github.com/neelg1/API-Traffic-Docs/issues/8)) Playwright script that logs in, lists, creates, edits, deletes, and triggers a 404, saving a HAR file. *Done when:* the HAR file is in `eval/recordings/` and the script reruns cleanly.
- [ ] **1.9 Parse HAR.** ([#9](https://github.com/neelg1/API-Traffic-Docs/issues/9)) Engine types for an `Exchange` plus a parse function, with tests against the recorded HAR. *Done when:* tests pass and every entry parses.
- [ ] **1.10 Filter noise.** ([#10](https://github.com/neelg1/API-Traffic-Docs/issues/10)) Drop static assets, `OPTIONS`, failed and non-JSON requests, and denylisted analytics hosts, with a test per rule. *Done when:* filtered output contains only API calls.
- [ ] **1.11 Group by exact path.** ([#11](https://github.com/neelg1/API-Traffic-Docs/issues/11)) Group exchanges by method and exact path (no pattern detection yet). *Done when:* a test shows the expected groups.
- [ ] **1.12 Score v0.** ([#12](https://github.com/neelg1/API-Traffic-Docs/issues/12)) `eval/score.ts` loads the ground truth, matches endpoints, and prints precision and recall. *Done when:* `pnpm eval` prints a table for app 1.
- [ ] **1.13 Run and record eval app 2.** ([#13](https://github.com/neelg1/API-Traffic-Docs/issues/13)) Mealie: run it, save its spec, write its Playwright recording. (Split into two tasks if it runs long.) *Done when:* `pnpm eval` covers both apps.
- [ ] **1.14 Baseline.** ([#14](https://github.com/neelg1/API-Traffic-Docs/issues/14)) Write the first numbers in `docs/results.md`, plus a short note on what failed. *Done when:* committed.
- [ ] **Gate:** baseline numbers recorded in `docs/results.md`

Expect low numbers here: without pattern detection, `/users/481` and `/users/92` count as two endpoints. That's the point of a baseline.

### Phase 2: Core engine (weeks 3–4, Nov 9 – Nov 22)

- [ ] E2 redaction with feature extraction; plant secrets and add the CI leak test
- [ ] E3 URL pattern detection with the segment tree
- [ ] E4 schema inference and merging, per status code, with shared components
- [ ] E5 OpenAPI 3.1 export with validation in tests
- [ ] Extend scoring to field, type, required, and parameter accuracy
- [ ] CLI: `generate recording.har -o openapi.yaml`
- [ ] **Gate:** field-level accuracy for both apps recorded in `docs/results.md`

### Phase 3: MVP (weeks 5–6, Nov 23 – Dec 6)

- [ ] Panel: hosts, endpoints, endpoint detail, docs viewer, export
- [ ] Capture and panel polish (follow-ups from 1.2–1.4): `getHAR()` backfill de-duplicated against live events, Start/Pause/Clear controls (X1), Tailwind setup, DevTools dark theme via `devtools.panels.themeName`, panel icon, Vitest for the panel's pure helpers (`formatBody`, plus a regression test for the missing-body bug from 1.4)
- [ ] IndexedDB storage with continuous writes and "clear all data"
- [ ] E6 AI enrichment v1 with structured output, validation, caching, and cost display
- [ ] First-run privacy screen and privacy policy draft
- [ ] Register as a Chrome Web Store developer
- [ ] Send a build to 5–10 beta testers
- [ ] **Gate:** MVP done and beta started

### Phase 4: Harden (weeks 7–8, Dec 7 – Dec 20)

- [ ] Turn every beta failure into a fixture and a test, then fix it
- [ ] Accuracy push toward the targets set after the baseline
- [ ] Add Immich and the tricky fixture app to the eval
- [ ] AI quality rubric on 30 sampled endpoints; record cost per 100 endpoints
- [ ] Store listing: descriptions, screenshots, permission justifications; submit for review
- [ ] Decide whether the phase-2 backend fits in the remaining time
- [ ] **Gate:** store submission in

### Phase 5: Holiday buffer (weeks 9–10, Dec 21 – Jan 3)

- [ ] README in its final structure with the accuracy table
- [ ] 30-second demo GIF and a 2-minute demo video
- [ ] Draft the write-up
- [ ] Stretch: E7 spec diff, or start the backend if chosen
- [ ] **Gate:** launch kit ready

### Phase 6: Launch (weeks 11–12, Jan 4 – Jan 17)

- [ ] Publish the store listing and the write-up
- [ ] Post to Show HN, relevant subreddits, and LinkedIn
- [ ] Respond to every issue and comment in the first week
- [ ] Publish final accuracy numbers and install counts in the README
- [ ] **Gate:** public launch done

## Launch and distribution

Launch in two steps: a quiet beta with a handful of developers around week 6, then a public launch the week of Jan 4 (week 11), after the holidays, once the store listing is approved.

### Chrome Web Store

1. Register as a developer early (week 4 or 5); it costs a [one-time $5 fee](https://blog.chromium.org/2020/03/new-developer-dashboard-and.html?m=0).
2. Prepare the listing: short and long description, 3–5 screenshots, a promo image, the privacy policy URL, and a written justification for each permission.
3. Submit at least 1–2 weeks before the planned public launch. Review time varies, and extensions that touch network data can get extra scrutiny.
4. Use an "unlisted" or trusted-tester release for the beta if the store allows it, or share a zip for manual install.

### Repo and README

The README is the landing page most visitors will actually read. Structure:

1. One-line pitch and a 30-second demo GIF at the top
2. Install links (Chrome Web Store, CLI)
3. How it works (the architecture diagram)
4. Accuracy table from the eval, with a link to the methodology
5. Privacy: what is captured, redacted, and never sent
6. Limitations and roadmap
7. Contributing guide and good first issues

### Beta (around week 6)

1. Recruit 5–10 developers: friends, colleagues, online developer communities.
2. Ask each to run it on one app they work on and send the exported spec plus feedback (never raw traffic).
3. Turn every failure into a fixture and a test.

### Public launch (weeks 11–12)

1. **Write-up:** "What I learned inferring API docs from browser traffic": the problem, the hard parts, the accuracy numbers, and what failed. Post on a personal blog or dev.to.
2. **Show HN** with the repo link and write-up.
3. **Reddit:** r/webdev and r/javascript (read each subreddit's self-promotion rules first).
4. **LinkedIn:** a short post with the demo GIF.
5. Optional: Product Hunt, developer newsletters.

**Track:** installs, weekly active users (count only, no content), GitHub stars, issues filed, and every piece of user feedback.

## Risks and mitigations

The biggest risks are time sinks, not technical dead ends; most mitigations are scope rules decided in advance.

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| URL pattern edge cases eat weeks | High | High | Set an accuracy target after the baseline; stop when it is hit; add manual merge and split in the UI |
| Over-building the UI | High | Medium | Plain tables only until week 8; judge the project on the engine and eval |
| Captured data leaks secrets | Medium | Very high | Redact at capture time; leak test in CI; AI sees schemas only; no server in v1 |
| Chrome Web Store review delays | Medium | Medium | Register by week 5; submit 1–2 weeks before launch; minimal permissions |
| Eval apps are hard to run or record | Medium | Medium | Start with the two easiest apps; automate with Playwright; commit HAR files so reruns don't need the apps |
| Ground-truth specs are wrong | Medium | Low | Keep a known-issues list; review mismatches before counting them |
| AI descriptions confidently wrong | Medium | Medium | Text-only changes, "unclear" allowed, measured with a rubric, can be turned off |
| Similar tool launches | Low | Low | The project doesn't need to win the market; the eval and write-up stand on their own |

**Weekly check (10 minutes, Sunday):** what shipped, current eval numbers, what's blocking, and whether anything should be cut from scope.

## Sources

- [chrome.devtools.network API reference](https://developer.chrome.com/docs/extensions/reference/api/devtools/network) (Chrome for Developers)
- [WXT web extension framework](https://github.com/wxt-dev/wxt) (GitHub)
- [Chrome Web Store developer registration fee](https://blog.chromium.org/2020/03/new-developer-dashboard-and.html?m=0) (Chromium Blog)
- [Full Stack FastAPI Template](https://github.com/fastapi/full-stack-fastapi-template) (GitHub)
- [Mealie API profile](https://providers.apievangelist.com/providers/mealie/) (API Evangelist)
- [Immich API and OpenAPI docs](https://docs.immich.app/api) (Immich)
- [GenSON schema inference behavior](https://docs.dottxt.ai/json-schema/genson) (reference for the schema merger baseline)
