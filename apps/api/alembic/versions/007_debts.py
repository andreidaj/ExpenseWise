"""Datorii: bani dați cuiva, în afara cheltuielilor."""

from alembic import op

revision = "007_debts"
down_revision = "006_period_start_day"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE r record;
        BEGIN
          FOR r IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'transactions'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%kind%'
          LOOP
            EXECUTE format('ALTER TABLE transactions DROP CONSTRAINT %I', r.conname);
          END LOOP;
        END $$;
        """
    )
    op.execute(
        """
        ALTER TABLE transactions
          ADD CONSTRAINT transactions_kind_check
          CHECK (kind IN ('income', 'expense', 'transfer', 'debt', 'repayment'))
        """
    )
    op.execute(
        """
        ALTER TABLE transactions
          ADD CONSTRAINT transactions_shape_check
          CHECK (
            (kind = 'transfer' AND counter_account_id IS NOT NULL AND category_id IS NULL)
            OR (kind IN ('income', 'expense') AND counter_account_id IS NULL AND category_id IS NOT NULL)
            OR (kind IN ('debt', 'repayment') AND counter_account_id IS NULL AND category_id IS NULL)
          )
        """
    )
    op.execute(
        """
        CREATE TABLE debts (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
            person_name     text NOT NULL,
            account_id      uuid NOT NULL REFERENCES accounts (id),
            transaction_id  uuid NOT NULL UNIQUE REFERENCES transactions (id) ON DELETE CASCADE,
            amount          numeric(19, 4) NOT NULL CHECK (amount > 0),
            currency        char(3) NOT NULL,
            occurred_on     date NOT NULL,
            note            text NOT NULL DEFAULT '',
            closed_at       timestamptz,
            created_by      uuid NOT NULL REFERENCES users (id),
            created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE debt_repayments (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            debt_id         uuid NOT NULL REFERENCES debts (id) ON DELETE CASCADE,
            account_id      uuid NOT NULL REFERENCES accounts (id),
            transaction_id  uuid NOT NULL UNIQUE REFERENCES transactions (id) ON DELETE CASCADE,
            amount          numeric(19, 4) NOT NULL CHECK (amount > 0),
            occurred_on     date NOT NULL,
            created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE debt_repayments")
    op.execute("DROP TABLE debts")
    op.execute("ALTER TABLE transactions DROP CONSTRAINT transactions_shape_check")
    op.execute("ALTER TABLE transactions DROP CONSTRAINT transactions_kind_check")
    op.execute(
        """
        ALTER TABLE transactions
          ADD CONSTRAINT transactions_kind_check
          CHECK (kind IN ('income', 'expense', 'transfer'))
        """
    )
    op.execute(
        """
        ALTER TABLE transactions
          ADD CONSTRAINT transactions_shape_check
          CHECK (
            (kind = 'transfer' AND counter_account_id IS NOT NULL AND category_id IS NULL)
            OR (kind IN ('income', 'expense') AND counter_account_id IS NULL AND category_id IS NOT NULL)
          )
        """
    )
