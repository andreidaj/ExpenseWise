"""Etapa 2 — bani, bugete, obiective, cursuri."""

from alembic import op

revision = "002_money"
down_revision = "001_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE recurring_rules (
            id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            space_id            uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
            account_id          uuid NOT NULL REFERENCES accounts (id),
            category_id         uuid NOT NULL REFERENCES categories (id),
            kind                text NOT NULL CHECK (kind IN ('income', 'expense')),
            amount              numeric(19, 4) NOT NULL CHECK (amount > 0),
            currency            char(3) NOT NULL,
            description         text NOT NULL DEFAULT '',
            frequency           text NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
            next_run_on         date NOT NULL,
            ends_on             date,
            paused_at           timestamptz,
            created_by          uuid NOT NULL REFERENCES users (id),
            created_at          timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        ALTER TABLE transactions
            ADD CONSTRAINT fk_tx_recurring
            FOREIGN KEY (recurring_rule_id) REFERENCES recurring_rules (id)
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX ux_tx_recurring_day
            ON transactions (recurring_rule_id, occurred_on)
            WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL
        """
    )
    op.execute(
        """
        CREATE TABLE budgets (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
            category_id     uuid REFERENCES categories (id),
            year            smallint NOT NULL CHECK (year BETWEEN 2000 AND 2100),
            month           smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
            limit_amount    numeric(19, 4) NOT NULL CHECK (limit_amount >= 0),
            currency        char(3) NOT NULL,
            created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX ux_budgets_period
            ON budgets (space_id, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid), year, month)
        """
    )
    op.execute(
        """
        CREATE TABLE goals (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
            name            text NOT NULL,
            target_amount   numeric(19, 4) NOT NULL CHECK (target_amount > 0),
            currency        char(3) NOT NULL,
            target_date     date,
            account_id      uuid REFERENCES accounts (id),
            archived_at     timestamptz,
            created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        ALTER TABLE transactions
            ADD CONSTRAINT fk_tx_goal
            FOREIGN KEY (goal_id) REFERENCES goals (id)
        """
    )
    op.execute(
        """
        CREATE TABLE exchange_rates (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            base_currency   char(3) NOT NULL,
            quote_currency  char(3) NOT NULL,
            rate_date       date NOT NULL,
            rate            numeric(19, 8) NOT NULL CHECK (rate > 0),
            source          text NOT NULL CHECK (source IN ('frankfurter', 'manual')),
            created_by      uuid REFERENCES users (id),
            created_at      timestamptz NOT NULL DEFAULT now(),
            UNIQUE (base_currency, quote_currency, rate_date, source)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS exchange_rates")
    op.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_tx_goal")
    op.execute("DROP TABLE IF EXISTS goals")
    op.execute("DROP TABLE IF EXISTS budgets")
    op.execute("DROP INDEX IF EXISTS ux_tx_recurring_day")
    op.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_tx_recurring")
    op.execute("DROP TABLE IF EXISTS recurring_rules")
