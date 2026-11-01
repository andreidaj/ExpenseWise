"""Ziua din lună de la care pornește perioada unui utilizator."""

from alembic import op

revision = "006_period_start_day"
down_revision = "005_category_groups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN period_start_day smallint NOT NULL DEFAULT 1")
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT users_period_start_day_check CHECK (period_start_day BETWEEN 1 AND 31)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP CONSTRAINT users_period_start_day_check")
    op.execute("ALTER TABLE users DROP COLUMN period_start_day")
