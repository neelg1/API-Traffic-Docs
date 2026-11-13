#!/usr/bin/env bash
# Runs the pinned Full Stack FastAPI Template locally for eval recordings.
# Usage: run.sh up | down | spec   (see README.md)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_URL="https://github.com/fastapi/full-stack-fastapi-template.git"
VERSION="0.12.0"
COMMIT="84c5a9e11a9e58262599e3d772f5386924e02ca7"
SRC="$HERE/src"
BASE_URL="http://localhost:8000"
SPEC_FILE="$HERE/../../ground-truth/fastapi-template.openapi.json"

# The template's compose.yml plus our overrides. Its compose.override.yml
# (dev-only services such as mailcatcher and playwright) is deliberately skipped.
compose() {
  docker compose \
    --project-name atd-fastapi \
    --project-directory "$SRC" \
    --env-file "$HERE/eval.env" \
    -f "$SRC/compose.yml" \
    -f "$HERE/compose.eval.yml" \
    "$@"
}

# Clones the template at the pinned commit into src/ (gitignored), once.
fetch_source() {
  if [ -d "$SRC/.git" ] && [ "$(git -C "$SRC" rev-parse HEAD)" = "$COMMIT" ]; then
    return
  fi
  rm -rf "$SRC"
  git clone --quiet --depth 1 --branch "$VERSION" "$REPO_URL" "$SRC"
  local actual
  actual="$(git -C "$SRC" rev-parse HEAD)"
  if [ "$actual" != "$COMMIT" ]; then
    echo "error: tag $VERSION points to $actual, expected $COMMIT" >&2
    exit 1
  fi
}

case "${1:-}" in
  up)
    fetch_source
    # Only db and backend: the backend serves the frontend too, and the
    # proxy and adminer aren't needed. --wait blocks until both are healthy.
    compose up --detach --build --wait db backend
    echo "Running at $BASE_URL (log in with FIRST_SUPERUSER from eval.env)"
    ;;
  down)
    # Also removes the database volume, so every `up` starts from the same state.
    compose down --volumes
    ;;
  spec)
    # Saves the running app's real spec as the eval's ground truth, pretty-printed
    # so diffs stay readable. Fails if the app isn't running.
    curl --fail --silent --show-error "$BASE_URL/api/v1/openapi.json" |
      node -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () =>
        process.stdout.write(JSON.stringify(JSON.parse(s), null, 2) + "\n"))' \
      > "$SPEC_FILE"
    echo "Saved $(cd "$(dirname "$SPEC_FILE")" && pwd)/$(basename "$SPEC_FILE")"
    ;;
  *)
    echo "usage: $0 up | down | spec" >&2
    exit 2
    ;;
esac
