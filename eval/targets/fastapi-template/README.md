# Eval app 1: Full Stack FastAPI Template

[fastapi/full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template) (MIT), pinned to release **0.12.0**, commit `84c5a9e11a9e58262599e3d772f5386924e02ca7`. A small, clean FastAPI + React app: the easy first target for the evaluation.

## Run it

Needs Docker Desktop running. From the repo root:

```
pnpm eval:fastapi up     # clone (first time), build, start; waits until healthy
pnpm eval:fastapi down   # stop and delete the database, so the next `up` starts fresh
pnpm eval:fastapi spec   # save the running app's spec to eval/ground-truth/
```

Then open <http://localhost:8000> and log in with `FIRST_SUPERUSER` / `FIRST_SUPERUSER_PASSWORD` from [`eval.env`](eval.env).

The first `up` downloads the template and builds its images (roughly 1 GB of downloads, several minutes). Later runs reuse the cache.

## Files

| File | Purpose |
| --- | --- |
| `run.sh` | Clones the template at the pinned commit into `src/` (gitignored) and runs it with Docker Compose |
| `compose.eval.yml` | Overrides on top of the template's `compose.yml`: publish only the backend on port 8000, run migrations and create the superuser on start, one worker |
| `eval.env` | Synthetic settings (not secrets) that replace the template's `changethis` defaults |

Only `db` and `backend` are started. The template's `compose.override.yml` (dev-only services such as mailcatcher and a Playwright image) is not used.

## Updating the version

Change `VERSION` and `COMMIT` in `run.sh` together, then re-record (task 1.8) and refresh the ground-truth spec, since scores are only comparable within one version.
