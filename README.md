# Apartment planner

Personal planner for buying an apartment off-plan (Aura Humaitá, apt. 166): installments,
fees and taxes, INCC/IGP-M correction projection, financing, milestones that re-schedule
payments, and a task checklist. Single owner, pt-BR UI, mobile-first.

## Structure
| Path | What |
|---|---|
| `backend/` | FastAPI + SQLAlchemy + Alembic (Python 3.12, `uv`). Business rules in `app/domain`. See `backend/README.md`. |
| `frontend/` | Angular 20 + PrimeNG PWA. `ApiService` has `HttpApiService` (real API) and `MockApiService` (in-memory). UX notes in `frontend/docs/ux-shneiderman.md`. |
| `docs/api.md` | API contract (source of truth when frontend and backend disagree). |
| `seed/` | `apto-166.example.json` (fake values, tracked). `apto-166.json` is the real data — gitignored. |
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
Options: `SKIP_SEED=1` keeps the current data, `SEED_FILE=...` picks another seed, `scripts/dev.sh stop-db` stops Postgres. API log: `.devdata/api.log`.

The Angular **development** configuration (`ng serve` default) uses `environment.development.ts`: real API at
`http://localhost:8000/api`, `useMock=false`, `authDisabled=true` (Supabase login skipped; ignored outside dev mode,
so production builds always require login). To run the UI alone with in-memory data: `cd frontend && npm run start:mock`.

## Tests
```sh
cd backend && uv run pytest -q && uv run ruff check .
cd frontend && npx ng build && npx ng test --watch=false     # needs CHROME_BIN for Karma if Chrome is not on PATH
```

## Never commit
`apto-docs/` (personal documents) and `seed/*.json` (real financial data; only `*.example.json` is allowed) are in
`.gitignore`. Also never commit `.env` files.
