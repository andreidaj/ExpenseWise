"""Grupul unei categorii."""

from alembic import op

revision = "005_category_groups"
down_revision = "004_assistant"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE categories ADD COLUMN group_name text")
    op.execute(
        """
        UPDATE categories SET group_name = CASE
            WHEN kind = 'expense' AND name IN ('Locuință', 'Utilități') THEN 'Acasă'
            WHEN kind = 'expense' AND name IN ('Mâncare', 'Transport', 'Cumpărături') THEN 'Zi de zi'
            WHEN kind = 'expense' AND name IN ('Sănătate', 'Educație', 'Divertisment', 'Abonamente') THEN 'Personal'
            WHEN kind = 'income' AND name IN ('Salariu', 'Freelance', 'Cadouri') THEN 'Intrări'
            ELSE 'Altele'
        END
        """
    )
    op.execute("ALTER TABLE categories ALTER COLUMN group_name SET NOT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE categories DROP COLUMN group_name")
