"""Etapa 1 — fundația."""

from alembic import op

revision = "001_foundation"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.execute(
        """
        CREATE TABLE users (
            id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            email               citext NOT NULL UNIQUE,
            password_hash       text NOT NULL,
            display_name        text NOT NULL,
            email_verified_at   timestamptz,
            report_view         text NOT NULL DEFAULT 'both'
                                CHECK (report_view IN ('separate', 'consolidated', 'both')),
            base_currency       char(3) NOT NULL DEFAULT 'RON',
            created_at          timestamptz NOT NULL DEFAULT now(),
            updated_at          timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE email_tokens (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            purpose         text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
            token_hash      text NOT NULL UNIQUE,
            expires_at      timestamptz NOT NULL,
            used_at         timestamptz,
            created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ix_email_tokens_user ON email_tokens (user_id, purpose, created_at)")
    op.execute(
        """
        CREATE TABLE refresh_tokens (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            token_hash      text NOT NULL UNIQUE,
            expires_at      timestamptz NOT NULL,
            revoked_at      timestamptz,
            created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE spaces (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            owner_id        uuid NOT NULL REFERENCES users (id),
            name            text NOT NULL,
            kind            text NOT NULL CHECK (kind IN ('personal', 'family', 'project')),
            base_currency   char(3) NOT NULL DEFAULT 'RON',
            starts_on       date,
            ends_on         date,
            created_at      timestamptz NOT NULL DEFAULT now(),
            archived_at     timestamptz
        )
        """
    )
    op.execute(
        """
        CREATE TABLE space_members (
            space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
            user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            role            text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
            created_at      timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (space_id, user_id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE space_invitations (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
            email           citext NOT NULL,
            role            text NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
            token_hash      text NOT NULL UNIQUE,
            invited_by      uuid NOT NULL REFERENCES users (id),
            expires_at      timestamptz NOT NULL,
            accepted_at     timestamptz,
            created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE accounts (
            id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            space_id                uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
            name                    text NOT NULL,
            kind                    text NOT NULL CHECK (kind IN ('cash', 'bank', 'card', 'savings')),
            currency                char(3) NOT NULL,
            opening_balance         numeric(19, 4) NOT NULL DEFAULT 0,
            opening_balance_date    date NOT NULL,
            archived_at             timestamptz,
            created_at              timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ix_accounts_space ON accounts (space_id)")
    op.execute(
        """
        CREATE TABLE categories (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
            name            text NOT NULL,
            kind            text NOT NULL CHECK (kind IN ('income', 'expense')),
            archived_at     timestamptz,
            created_at      timestamptz NOT NULL DEFAULT now(),
            UNIQUE (space_id, kind, name)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE transactions (
            id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            space_id            uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
            account_id          uuid NOT NULL REFERENCES accounts (id),
            counter_account_id  uuid REFERENCES accounts (id),
            category_id         uuid REFERENCES categories (id),
            goal_id             uuid,
            recurring_rule_id   uuid,
            kind                text NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
            amount              numeric(19, 4) NOT NULL CHECK (amount > 0),
            currency            char(3) NOT NULL,
            counter_amount      numeric(19, 4),
            counter_currency    char(3),
            fx_rate             numeric(19, 8),
            fx_rate_date        date,
            fx_source           text CHECK (fx_source IS NULL OR fx_source IN ('frankfurter', 'manual')),
            occurred_on         date NOT NULL,
            description         text NOT NULL DEFAULT '',
            origin              text NOT NULL DEFAULT 'app'
                                CHECK (origin IN ('app', 'asistent', 'import', 'ocr')),
            import_fingerprint  text,
            created_by          uuid NOT NULL REFERENCES users (id),
            created_at          timestamptz NOT NULL DEFAULT now(),
            updated_at          timestamptz NOT NULL DEFAULT now(),
            deleted_at          timestamptz,
            CHECK (
                (kind = 'transfer' AND counter_account_id IS NOT NULL AND category_id IS NULL)
                OR
                (kind IN ('income', 'expense') AND counter_account_id IS NULL AND category_id IS NOT NULL)
            ),
            CHECK (account_id <> counter_account_id)
        )
        """
    )
    op.execute("CREATE INDEX ix_tx_space_date ON transactions (space_id, occurred_on)")
    op.execute("CREATE INDEX ix_tx_account_date ON transactions (account_id, occurred_on)")
    op.execute(
        """
        CREATE UNIQUE INDEX ux_tx_import_fp
            ON transactions (space_id, import_fingerprint)
            WHERE import_fingerprint IS NOT NULL AND deleted_at IS NULL
        """
    )
    op.execute(
        """
        CREATE TABLE audit_log (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id         uuid REFERENCES users (id),
            space_id        uuid REFERENCES spaces (id) ON DELETE SET NULL,
            action          text NOT NULL,
            entity_type     text,
            entity_id       uuid,
            detail          jsonb,
            created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ix_audit_space ON audit_log (space_id, created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS audit_log")
    op.execute("DROP TABLE IF EXISTS transactions")
    op.execute("DROP TABLE IF EXISTS categories")
    op.execute("DROP TABLE IF EXISTS accounts")
    op.execute("DROP TABLE IF EXISTS space_invitations")
    op.execute("DROP TABLE IF EXISTS space_members")
    op.execute("DROP TABLE IF EXISTS spaces")
    op.execute("DROP TABLE IF EXISTS refresh_tokens")
    op.execute("DROP TABLE IF EXISTS email_tokens")
    op.execute("DROP TABLE IF EXISTS users")
