# Recordings

HAR files of scripted sessions against the eval apps: the engine's input when scoring (task 1.12). They are generated, so don't edit them by hand; re-record instead.

| File | App | App version | Script |
| --- | --- | --- | --- |
| `fastapi-template.har` | [Full Stack FastAPI Template](../targets/fastapi-template/README.md) | 0.12.0 (`84c5a9e`) | [`scripts/record-fastapi.ts`](../scripts/record-fastapi.ts) |

## Re-record

Needs Docker and a one-time `pnpm --filter eval exec playwright install chromium`. From the repo root:

```
pnpm eval:fastapi down && pnpm eval:fastapi up   # start from an empty database
pnpm --filter eval record:fastapi
```

The script also works against a database it has already used (emails and names are unique per run), but commit recordings made from a fresh `up`.

## What's in `fastapi-template.har`

- **UI walkthrough as the admin:** log in, list/create/edit/delete items, list/create/edit/delete users, update the profile. Then a public sign-up, a duplicate sign-up (400), and the new user changing their password, trying an invalid reset token (400), recovering the account by email (the script reads the reset link from Mailcatcher), logging in with the reset password, and deleting their account.
- **Direct API calls from the page** for what the UI never calls or to force errors: health check, test token, test email, items and users paging (`skip`/`limit`), read an item and a user by id, a missing item (404), a malformed id and a missing title (422), `users/me` without a token (401), and DELETEs with full responses.
- **Errors captured:** 400, 401, 404, 422.
- **Coverage:** 21 of the spec's 22 operations. The missing one crashes the server in this app version; see [`../known-spec-issues.md`](../known-spec-issues.md).

## Things to know

- **Static assets keep their entries but not their bodies.** Scripts, stylesheets, and images are listed with URL, headers, type, and size, but their body text is removed (each has a `content.comment` saying so). They are the realistic noise the engine's filter must drop; their bodies were 90% of the file and nothing reads them.
- **Some UI requests are recorded as aborted** (`status: -1`, `net::ERR_ABORTED`): the UI's item and user DELETEs every time, even though they succeed and the app receives the response, and sometimes the `users/me` check the app makes before login. The direct calls record full responses for the same operations, and aborted entries are realistic input for the engine's filter, which drops failed requests.
- **Credentials and tokens in the file are synthetic** (from `eval.env` or created by the script). They only ever existed in local containers.
- **Re-recordings differ** in ids, timestamps, tokens, and the per-run suffix in emails and names; the set of requests stays the same.
- **Mailcatcher isn't in the recording.** The script reads emails from it directly (outside the browser), because it isn't part of the app's API.
