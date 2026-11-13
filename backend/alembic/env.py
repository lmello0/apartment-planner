from sqlalchemy import create_engine

from alembic import context
from app.config import get_config
from app.db import models  # noqa: F401
from app.db.base import Base

target_metadata = Base.metadata
url = get_config().database_url


def run_migrations_online() -> None:
    engine = create_engine(url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    run_migrations_online()
