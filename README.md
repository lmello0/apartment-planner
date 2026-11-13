# Apartment planner

Personal planner for buying an apartment off-plan (Aura Humaitá, apt. 166): installments,
fees and taxes, INCC/IGP-M correction projection, financing, milestones that re-schedule
payments, and a task checklist. Single owner, pt-BR UI, desktop-first (responsivo).

## Structure
| Path | What |
|---|---|
| `backend/` | FastAPI + SQLAlchemy + Alembic (Python 3.12, `uv`). Business rules in `app/domain`. See `backend/README.md`. |
| `frontend/` | Angular 20 + PrimeNG PWA. `ApiService` has `HttpApiService` (real API) and `MockApiService` (in-memory). UX notes in `frontend/docs/ux-shneiderman.md`. |
| `docs/api.md` | API contract (source of truth when frontend and backend disagree). |
| `seed/` | `apto-166.example.json` and `docs-map.example.json` (fake values, tracked). `apto-166.json` and `docs-map.json` are real data — gitignored. |
| `scripts/` | `dev.sh` (one-command dev runner), `dev_db.py` (local Postgres via pgserver). |

## Run everything locally (one command)
Requirements: `uv`, Node 20+, and `seed/apto-166.json` (copy the example and edit it if you do not have it).
```sh
scripts/dev.sh
```
It starts a local Postgres (`pgserver`, data in `~/.local/share/apartment-planner/pg` — outside the repo because
Postgres needs a 0700 directory, which `/mnt/c` mounts cannot give), runs `alembic upgrade head`,
`import-seed` (wipes and reloads the DB), `uvicorn` on <http://localhost:8000> with `AUTH_DISABLED=true` and CORS
for `http://localhost:4200`, then `ng serve` on <http://localhost:4200>. Ctrl+C stops the API and Angular.
Documents (PDF/images) are stored on disk in `.devdata/files` in dev (`STORAGE_BACKEND=local`); production uses a private Supabase Storage bucket.
Options: `SKIP_SEED=1` keeps the current data, `SEED_FILE=...` picks another seed, `scripts/dev.sh stop-db` stops Postgres. API log: `.devdata/api.log`.

The Angular **development** configuration (`ng serve` default) uses `environment.development.ts`: real API at
`http://localhost:8000/api`, `useMock=false`, `authDisabled=true` (Supabase login skipped; ignored outside dev mode,
so production builds always require login). To run the UI alone with in-memory data: `cd frontend && npm run start:mock`.

## Documents
```sh
scripts/dev.sh import-docs            # dry run: lists every file in apto-docs/ with its category/title (seed/docs-map.json)
scripts/dev.sh import-docs --apply    # uploads them to the local dev storage
cd backend && uv run python -m app.cli import-docs ../apto-docs --map ../seed/docs-map.json [--apply]   # any environment (uses STORAGE_BACKEND)
cd backend && uv run python -m app.cli cleanup-docs                                                      # delete PENDING uploads older than 24 h
```
See `docs/api.md` ("Changes (documents module)") for the endpoints, the 3-step upload flow and the map format.

## Tests
```sh
cd backend && uv run pytest -q && uv run ruff check .
cd frontend && npx ng build && npx ng test --watch=false     # needs CHROME_BIN for Karma if Chrome is not on PATH
```

## Deploy

First deploy (Supabase + Google Cloud Run + Cloudflare Pages) is guided by an interactive wizard:

```bash
scripts/deploy-wizard.sh            # FROM=9 scripts/deploy-wizard.sh resumes at stage 9 (e.g. Storage bucket + secret key)
```

It opens each console, tells you what to click, stores captured values in the gitignored `.env.deploy`, creates the private `documents` Storage bucket and keeps the service-role key in Secret Manager, runs migrations + seed against Supabase, deploys the API to Cloud Run and the PWA to Cloudflare Pages. Re-running it is safe: it offers the values already saved.

## Never commit
`apto-docs/` (personal documents) and `seed/*.json` (real financial data; only `*.example.json` is allowed) are in
`.gitignore`. Also never commit `.env` files.
