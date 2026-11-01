from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import text

API_ROOT = Path(__file__).resolve().parents[1]
TEST_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://expensewise:expensewise@localhost:5432/expensewise_test",
)
os.environ["DATABASE_URL"] = TEST_URL
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_TTL_MINUTES", "15")
os.environ.setdefault("REFRESH_TOKEN_TTL_DAYS", "30")
os.environ.setdefault("APP_PUBLIC_URL", "http://localhost:3000")
os.environ.setdefault("ASSISTANT_PUBLIC_URL", "http://localhost:3000")
os.environ.setdefault("RESEND_API_KEY", "")
os.environ.setdefault("OCR_URL", "")
os.environ.setdefault("FRANKFURTER_URL", "https://api.frankfurter.app")
os.environ.setdefault("EMAIL_FROM", "ExpenseWise <noreply@localhost>")

_db_name = TEST_URL.rsplit("/", 1)[-1].split("?", 1)[0]
if not _db_name.endswith("_test"):
    pytest.exit("Refuz să rulez testele: numele bazei nu se termină în _test", returncode=2)


def _prepare_database() -> None:
    sys.path.insert(0, str(API_ROOT))
    script = API_ROOT / "scripts" / "create_test_db.py"
    subprocess.check_call([sys.executable, str(script)], cwd=str(API_ROOT))
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(API_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", TEST_URL)
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session")
def _boot():
    _prepare_database()
    from app.main import app

    return app


@pytest.fixture(scope="session")
def client(_boot):
    from fastapi.testclient import TestClient

    with TestClient(_boot, base_url="http://localhost:3000") as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _clean(request):
    if "client" not in request.fixturenames and "_boot" not in request.fixturenames:
        yield
        return
    from app.database import engine
    from app.security import clear_register_limits

    def truncate() -> None:
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    TRUNCATE TABLE
                      assistant_idempotency,
                      assistant_tokens,
                      assistant_auth_codes,
                      assistant_grants,
                      assistant_auth_requests,
                      assistant_oauth_clients,
                      receipt_drafts,
                      import_rows,
                      import_batches,
                      exchange_rates,
                      transactions,
                      recurring_rules,
                      budgets,
                      goals,
                      categories,
                      accounts,
                      space_invitations,
                      space_members,
                      audit_log,
                      spaces,
                      refresh_tokens,
                      email_tokens,
                      users
                    RESTART IDENTITY CASCADE
                    """
                )
            )

    truncate()
    clear_register_limits()
    yield
    truncate()
    clear_register_limits()


@pytest.fixture(autouse=True)
def _mail_logs(caplog):
    caplog.set_level("INFO", logger="expensewise.mail")
    yield
