#!/usr/bin/env bash
# One-command local dev: Postgres (pgserver) -> alembic -> import-seed -> uvicorn -> ng serve.
#   scripts/dev.sh            start everything (Ctrl+C stops the API and ng serve)
#   scripts/dev.sh stop-db    stop the local Postgres started by this script
#   SKIP_SEED=1 scripts/dev.sh   keep the current database content (default: reload the seed)
#   SEED_FILE=path scripts/dev.sh   use another seed file (default: seed/apto-166.json)
#   scripts/dev.sh import-docs [--apply]   list (dry run) or upload apto-docs/ with seed/docs-map.json
# Documents live in .devdata/files (STORAGE_BACKEND=local).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
SEED_FILE="${SEED_FILE:-$ROOT/seed/apto-166.json}"
API_PORT="${API_PORT:-8000}"
LOG_DIR="$ROOT/.devdata"
mkdir -p "$LOG_DIR"

if [[ "${1:-}" == "stop-db" ]]; then
  PGDATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/apartment-planner/pg"
  "$BACKEND/.venv/lib/"python*/site-packages/pgserver/pginstall/bin/pg_ctl -D "$PGDATA_DIR" stop -m fast
  exit 0
fi

if [[ "${1:-}" == "import-docs" ]]; then
  shift
  export STORAGE_BACKEND=local STORAGE_LOCAL_DIR="$ROOT/.devdata/files"
  export DATABASE_URL
  DATABASE_URL="$(cd "$BACKEND" && uv run python "$ROOT/scripts/dev_db.py")"
  cd "$BACKEND" && exec uv run python -m app.cli import-docs "$ROOT/apto-docs" \
    --map "${DOCS_MAP:-$ROOT/seed/docs-map.json}" "$@"
fi

command -v uv >/dev/null || { echo "uv is required (https://docs.astral.sh/uv/)"; exit 1; }
command -v npm >/dev/null || { echo "node/npm is required"; exit 1; }

echo "==> Backend dependencies"
(cd "$BACKEND" && uv sync --quiet)
[[ -d "$FRONTEND/node_modules" ]] || (cd "$FRONTEND" && npm ci)

echo "==> Postgres (pgserver)"
export DATABASE_URL
DATABASE_URL="$(cd "$BACKEND" && uv run python "$ROOT/scripts/dev_db.py")"

echo "==> Migrations"
(cd "$BACKEND" && uv run alembic upgrade head)

if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  if [[ -f "$SEED_FILE" ]]; then
    echo "==> Seed: $SEED_FILE"
    (cd "$BACKEND" && uv run python -m app.cli import-seed "$SEED_FILE")
  else
    echo "!! $SEED_FILE not found (it is gitignored); the database stays empty."
    echo "   Copy seed/apto-166.example.json to seed/apto-166.json and edit it, or set SEED_FILE."
  fi
fi

# Documents are stored on local disk in dev (no Supabase Storage needed); the API serves them
# through /api/dev-storage (only registered when ENV != production).
export STORAGE_BACKEND=local STORAGE_LOCAL_DIR="$ROOT/.devdata/files" API_PUBLIC_URL="http://localhost:$API_PORT"

echo "==> API on http://localhost:$API_PORT (AUTH_DISABLED=true, STORAGE_BACKEND=local, CORS for http://localhost:4200)"
(cd "$BACKEND" && AUTH_DISABLED=true ENV=development CORS_ORIGINS=http://localhost:4200 \
  uv run uvicorn app.main:app --port "$API_PORT" --reload) >"$LOG_DIR/api.log" 2>&1 &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 40); do
  curl -fs "http://localhost:$API_PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -fs "http://localhost:$API_PORT/api/health" >/dev/null || { echo "API failed to start, see $LOG_DIR/api.log"; exit 1; }

echo "==> Angular on http://localhost:4200 (development config: real API, login skipped)"
cd "$FRONTEND" && npx ng serve
