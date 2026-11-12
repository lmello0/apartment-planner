from __future__ import annotations

import argparse
import json
from pathlib import Path

from sqlalchemy.orm import sessionmaker

from app.api.schemas import SeedFile
from app.db.session import get_engine
from app.services.seed import import_seed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    imp = sub.add_parser("import-seed", help="wipe and reload data from a seed JSON")
    imp.add_argument("path", type=Path)
    args = parser.parse_args(argv)

    if args.command == "import-seed":
        seed = SeedFile.model_validate(json.loads(args.path.read_text(encoding="utf-8")))
        with sessionmaker(get_engine())() as session:
            counts = import_seed(session, seed)
            session.commit()
        print(f"Imported: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
