"""Etapa 3 — import și OCR."""

from alembic import op

revision = "003_import_ocr"
down_revision = "002_money"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE import_batches (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
            filename        text NOT NULL,
            status          text NOT NULL CHECK (status IN ('preview', 'confirmed', 'discarded')),
            created_by      uuid NOT NULL REFERENCES users (id),
            created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE import_rows (
            id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            batch_id            uuid NOT NULL REFERENCES import_batches (id) ON DELETE CASCADE,
            row_number          integer NOT NULL,
            raw                 jsonb NOT NULL,
            mapped              jsonb,
            duplicate_of        uuid REFERENCES transactions (id),
            status              text NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'imported', 'skipped')),
            UNIQUE (batch_id, row_number)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE receipt_drafts (
            id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            space_id        uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
            created_by      uuid NOT NULL REFERENCES users (id),
            merchant        text,
            occurred_on     date,
            total_amount    numeric(19, 4),
            currency        char(3),
            lines           jsonb NOT NULL DEFAULT '[]',
            status          text NOT NULL DEFAULT 'pending_review'
                            CHECK (status IN ('pending_review', 'saved', 'discarded')),
            created_at      timestamptz NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS receipt_drafts")
    op.execute("DROP TABLE IF EXISTS import_rows")
    op.execute("DROP TABLE IF EXISTS import_batches")
