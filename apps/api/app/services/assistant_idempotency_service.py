from __future__ import annotations

import json
import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import AssistantIdempotency, Transaction
from app.money import now_utc
from app.security import sha256_hex


def canonical_fingerprint(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return sha256_hex(raw)


def begin(db: Session, grant_id: uuid.UUID, fingerprint: str) -> tuple[AssistantIdempotency, Transaction | None]:
    row = db.scalar(
        select(AssistantIdempotency).where(
            AssistantIdempotency.grant_id == grant_id,
            AssistantIdempotency.fingerprint == fingerprint,
        )
    )
    now = now_utc()
    if row is not None and row.status == "complete" and row.transaction_id is not None:
        existing = db.get(Transaction, row.transaction_id)
        if existing is not None:
            return row, existing
    if row is not None and row.status == "in_progress":
        if row.updated_at and row.updated_at > now - timedelta(minutes=5):
            raise AppError(409, "Cererea identică este în curs.")
    if row is None:
        row = AssistantIdempotency(
            grant_id=grant_id,
            fingerprint=fingerprint,
            status="in_progress",
            created_at=now,
            updated_at=now,
        )
        db.add(row)
    else:
        row.status = "in_progress"
        row.updated_at = now
    db.commit()
    return row, None


def complete(db: Session, row: AssistantIdempotency, transaction_id: uuid.UUID) -> None:
    row.status = "complete"
    row.transaction_id = transaction_id
    row.updated_at = now_utc()
    db.commit()


def abandon(db: Session, grant_id: uuid.UUID, fingerprint: str) -> None:
    db.rollback()
    row = db.scalar(
        select(AssistantIdempotency).where(
            AssistantIdempotency.grant_id == grant_id,
            AssistantIdempotency.fingerprint == fingerprint,
        )
    )
    if row is not None:
        row.status = "abandoned"
        row.updated_at = now_utc()
        db.commit()
