"""Create expensewise_test next to the application database."""

from __future__ import annotations

import os

from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url


def main() -> None:
    raw = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg://expensewise:expensewise@localhost:5432/expensewise",
    )
    url = make_url(raw)
    target = "expensewise_test"
    admin = url.set(database="postgres")
    engine = create_engine(admin, isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": target},
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{target}"'))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
