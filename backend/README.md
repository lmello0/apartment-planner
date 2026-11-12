# apartment-planner backend

FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2 (Python 3.12, managed with `uv`).
Pure business rules live in `app/domain` (no framework imports); `app/services` talk to the
database; `app/api` is the HTTP layer. Money is always `Decimal` (`Numeric(14,2)`).
API reference: [`../docs/api.md`](../docs/api.md).

## Setup
```sh
cd backend
uv sync
cp .env.example .env        # set DATABASE_URL, SUPABASE_URL, OWNER_EMAIL
```
Local Postgres example: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=apartment_planner postgres:16`.

## Migrate, seed, run
```sh
uv run alembic upgrade head
uv run python -m app.cli import-seed ../seed/apto-166.json   # idempotent: wipes and reloads
AUTH_DISABLED=true uv run uvicorn app.main:app --reload       # http://localhost:8000/api/health
```
`seed/apto-166.json` is gitignored (financial values only); `seed/apto-166.example.json` shows the
structure with fake values.

## Test and lint
```sh
uv run pytest -q
uv run ruff check .
```
API tests use in-memory SQLite by default. To run them on Postgres:
`TEST_DATABASE_URL=postgresql+psycopg://... uv run pytest -q` (**the tests drop and create all
tables** in that database — use a scratch one).

## Auth
Requests carry the Supabase access token (`Authorization: Bearer ...`). The token is verified via
`$SUPABASE_URL/auth/v1/.well-known/jwks.json` (RS256/ES256, audience `authenticated`) and its
`email` must equal `OWNER_EMAIL` (otherwise 403). `AUTH_DISABLED=true` skips this for local
development and the app refuses to start with it when `ENV=production`.

## Deploy (Cloud Run)
```sh
docker build -t apartment-planner-api .
docker run -p 8080:8080 --env-file .env apartment-planner-api
```
Run `uv run alembic upgrade head` against the production database as a release step.
