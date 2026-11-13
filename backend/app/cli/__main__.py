from __future__ import annotations

import argparse
import json
from pathlib import Path

from sqlalchemy.orm import sessionmaker

from app.api.schemas import SeedFile
from app.cli import docs as docs_cli
from app.db.session import get_engine
from app.services import documents
from app.services.seed import import_seed
from app.storage import get_storage


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    imp = sub.add_parser("import-seed", help="wipe and reload data from a seed JSON")
    imp.add_argument("path", type=Path)
    idocs = sub.add_parser(
        "import-docs", help="list (dry run, default) or upload (--apply) the files of a directory")
    idocs.add_argument("directory", type=Path)
    idocs.add_argument("--map", type=Path, required=True, dest="map_file",
                       help="JSON mapping relative file names to title/category")
    idocs.add_argument("--apply", action="store_true", help="upload through the storage adapter")
    sub.add_parser("cleanup-docs", help="delete PENDING documents older than 24 h")
    args = parser.parse_args(argv)

    if args.command == "import-seed":
        seed = SeedFile.model_validate(json.loads(args.path.read_text(encoding="utf-8")))
        with sessionmaker(get_engine())() as session:
            counts = import_seed(session, seed)
            session.commit()
        print(f"Imported: {counts}")
    elif args.command == "import-docs":
        if not args.directory.is_dir():
            parser.error(f"not a directory: {args.directory}")
        plans = docs_cli.build_plan(args.directory, docs_cli.load_map(args.map_file))
        if not args.apply:
            for plan in plans:
                print(docs_cli.describe(plan))
            problems = sum(1 for p in plans if p.problem)
            print(f"\n{len(plans)} file(s), {problems} would be skipped. Dry run: use --apply to upload.")
            return 0
        with sessionmaker(get_engine())() as session:
            print(docs_cli.apply_plan(session, get_storage(), plans))
    elif args.command == "cleanup-docs":
        with sessionmaker(get_engine())() as session:
            removed = documents.cleanup_pending(session, get_storage())
            session.commit()
        print(f"Removed {removed} pending document(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
