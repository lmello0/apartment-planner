"""Start (or reuse) a local Postgres via pgserver and print its DATABASE_URL.

Usage: uv run --project backend python scripts/dev_db.py [data_dir]
The server keeps running after this script exits (cleanup_mode=None); stop it with
`scripts/dev.sh stop-db`. Data lives in ~/.local/share/apartment-planner/pg (outside the repo: Postgres needs a
0700 data directory, which NTFS mounts such as /mnt/c cannot provide).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pgserver

DB_NAME = "apartment_planner"


def main() -> None:
    base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    data = Path(sys.argv[1]) if len(sys.argv) > 1 else base / "apartment-planner" / "pg"
    data.mkdir(parents=True, exist_ok=True)
    server = pgserver.get_server(data, cleanup_mode=None)
    exists = server.psql(f"SELECT 1 FROM pg_database WHERE datname='{DB_NAME}';")
    if "(0 rows)" in exists or "1" not in exists:
        server.psql(f"CREATE DATABASE {DB_NAME};")
    uri = server.get_uri(DB_NAME)
    print(uri)


if __name__ == "__main__":
    main()
