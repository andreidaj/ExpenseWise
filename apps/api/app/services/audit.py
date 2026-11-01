from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models import AuditLog
from app.money import now_utc


def audit(
    db: Session,
    *,
    action: str,
    user_id: uuid.UUID | None = None,
    space_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    detail: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            space_id=space_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            detail=detail,
            created_at=now_utc(),
        )
    )
