"""Etapa 4 — tabelele MCP."""

from alembic import op

revision = "004_assistant"
down_revision = "003_import_ocr"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE assistant_oauth_clients (
            client_id       text PRIMARY KEY,
            client_info     text NOT NULL,
            created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE assistant_auth_requests (
            id              text PRIMARY KEY,
            client_id       text NOT NULL REFERENCES assistant_oauth_clients (client_id),
            params          text NOT NULL,
            expires_at      timestamptz NOT NULL,
            created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE assistant_grants (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            client_id       text NOT NULL REFERENCES assistant_oauth_clients (client_id),
            client_name     text,
            created_at      timestamptz NOT NULL DEFAULT now(),
            last_used_at    timestamptz,
            revoked_at      timestamptz
        )
        """
    )
    op.execute("CREATE INDEX ix_assistant_grants_user ON assistant_grants (user_id, revoked_at)")
    op.execute(
        """
        CREATE TABLE assistant_auth_codes (
            code_hash           text PRIMARY KEY,
            grant_id            uuid NOT NULL REFERENCES assistant_grants (id) ON DELETE CASCADE,
            client_id           text NOT NULL,
            code_challenge      text NOT NULL,
            redirect_uri        text NOT NULL,
            redirect_uri_provided_explicitly boolean NOT NULL DEFAULT true,
            resource            text,
            scopes              text NOT NULL DEFAULT '',
            expires_at          timestamptz NOT NULL,
            used_at             timestamptz
        )
        """
    )
    op.execute(
        """
        CREATE TABLE assistant_tokens (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            token_hash      text NOT NULL UNIQUE,
            kind            text NOT NULL CHECK (kind IN ('access', 'refresh')),
            grant_id        uuid NOT NULL REFERENCES assistant_grants (id) ON DELETE CASCADE,
            client_id       text NOT NULL,
            scopes          text NOT NULL DEFAULT '',
            resource        text,
            expires_at      timestamptz NOT NULL,
            revoked_at      timestamptz,
            created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ix_assistant_tokens_grant ON assistant_tokens (grant_id)")
    op.execute(
        """
        CREATE TABLE assistant_idempotency (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            grant_id        uuid NOT NULL REFERENCES assistant_grants (id) ON DELETE CASCADE,
            fingerprint     text NOT NULL,
            status          text NOT NULL CHECK (status IN ('in_progress', 'complete', 'abandoned')),
            transaction_id  uuid REFERENCES transactions (id),
            created_at      timestamptz NOT NULL DEFAULT now(),
            updated_at      timestamptz NOT NULL DEFAULT now(),
            UNIQUE (grant_id, fingerprint)
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS assistant_idempotency")
    op.execute("DROP TABLE IF EXISTS assistant_tokens")
    op.execute("DROP TABLE IF EXISTS assistant_auth_codes")
    op.execute("DROP TABLE IF EXISTS assistant_grants")
    op.execute("DROP TABLE IF EXISTS assistant_auth_requests")
    op.execute("DROP TABLE IF EXISTS assistant_oauth_clients")
