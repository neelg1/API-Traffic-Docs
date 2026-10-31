# API Traffic to Docs (working title)

A Chrome extension plus a standalone TypeScript engine that turns live browser API traffic into OpenAPI 3.1 documentation. The full roadmap is in `docs/ROADMAP.md`; read only the section relevant to the current task.

## Project map

```
packages/engine/       Pure TS library: the whole inference pipeline
  src/ingest/          HAR parsing and filtering
  src/redact/          Secret and PII redaction, value feature extraction
  src/group/           Endpoint grouping and URL pattern inference
  src/infer/           Schema inference and merging
  src/openapi/         OpenAPI 3.1 builder and serialization
  src/enrich/          Optional LLM enrichment (text fields only)
  src/diff/            Spec diffing (stretch)
  test/                Unit, property, snapshot tests and HAR fixtures
apps/extension/        WXT project: DevTools panel, IndexedDB storage, UI
apps/cli/              CLI: generate a spec from a HAR file
eval/                  Target apps, recordings, ground-truth specs, score.ts
docs/                  ROADMAP.md, decisions.md, results.md
```

## Commands

Update these when the scripts change.

- `pnpm install` - install all workspaces
- `pnpm test` - run all tests
- `pnpm --filter engine test` - engine tests only
- `pnpm eval` - run the evaluation and write the report
- `pnpm --filter extension dev` - run the extension with hot reload
- `pnpm lint` and `pnpm typecheck` - must pass before committing

## Architecture rules (do not break these)

1. **The engine is pure.** Nothing in `packages/engine/src` may use the DOM, `chrome.*`, `fetch`, the file system, timers, or randomness. Same input, same output.
2. **Pipeline order:** ingest -> redact -> group -> infer -> build OpenAPI -> (optional) enrich.
3. **Store observations, not raw traffic.** The engine aggregates evidence per endpoint; raw values are not persisted.
4. **Redaction comes first.** The extension redacts at capture time, before anything is written to storage or sent to an LLM.
5. **Never log raw request or response bodies or header values,** including in debug output and test failure messages.
6. **The AI step sees schemas only:** paths, parameter names, field names, types, status codes. Never values. It may change only text fields (names, summaries, descriptions, tags), never paths, types, or structure. Its output is validated against a schema, and a deterministic fallback exists when it is off or fails.
7. **The extension is a thin shell.** No inference logic in `apps/extension`; it calls the engine.

## v1 scope

- In: Chrome (Manifest V3), DevTools panel, REST over HTTP with JSON bodies, single user, local storage, HAR import and export.
- Out: GraphQL, WebSockets, gRPC-web, Firefox and Safari, teams and sharing, a backend.
- If a task would need something out of scope, stop and ask before building it.

## Coding conventions

- TypeScript strict mode; no `any` without a comment explaining why.
- Small, pure functions with named exports; types for every public function.
- Vitest for tests. Engine tests live in `packages/engine/test`.
- Conventional commit messages that reference the issue number (e.g. `feat(group): collapse UUID segments (#12)`).
- Don't add a dependency without asking first, and say why it's needed.

## Testing rules

- Every engine change comes with tests.
- Every bug gets a fixture and a failing test before the fix.
- The leak test (planted secrets must never appear in output, storage, or prompts) must always pass.
- For changes to grouping, inference, or redaction, run `pnpm eval` and report the metric changes versus main.
- Never update snapshots without explaining what changed and why.
- Fixtures contain only synthetic data or traffic recorded from the eval apps. Never real traffic from any other system.

## How to work with me

- **Plan first.** For any non-trivial task, propose a plan and wait for approval before writing code.
- **Small steps only.** Break every issue into numbered steps, each one small enough to review in a few minutes: one concern, a handful of files, roughly under 150 changed lines. Do one step, then stop and show me what changed (files touched, what each change does, how to verify it) and wait for my go-ahead before the next step. Never batch several steps into one large change at the end. If a step grows bigger than planned, stop and propose splitting it.
- **Keep it runnable.** After every step, tests and the build should still pass, so each step could be its own commit.
- **One issue per session.** Stay within the issue's scope; list anything else you notice as follow-ups instead of doing it.
- **I write the core algorithms.** Do not implement the logic in `src/redact`, `src/group`, or `src/infer`, or the LLM prompts in `src/enrich`, unless I explicitly ask. For those areas you may write tests and fixtures, find edge cases, review my code, and suggest approaches.
- **Explain non-obvious choices** in your summary, and suggest an entry for `docs/decisions.md` when a real design choice was made.
- **Don't commit or push** unless I ask.

## Key docs

- `docs/ROADMAP.md` - full plan: phases, workstreams, metrics, risks
- `docs/decisions.md` - design decisions and why
- `docs/results.md` - eval results over time
- `eval/known-spec-issues.md` - known errors in ground-truth specs
