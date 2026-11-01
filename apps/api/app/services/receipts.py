from __future__ import annotations

import os
import uuid
from datetime import date
from decimal import Decimal

import httpx
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Account, Category, ReceiptDraft, Space, User
from app.money import now_utc, parse_positive, q4
from app.services.ledger import create_transaction


def ocr_url() -> str:
    return os.environ.get("OCR_URL", "").strip().rstrip("/")


def create_draft(db: Session, *, space: Space, user: User, filename: str, content: bytes, content_type: str) -> ReceiptDraft:
    url = ocr_url()
    if not url:
        raise AppError(
            503,
            "Serviciul OCR nu este configurat. Setează OCR_URL sau pornește Docker cu profilul ocr.",
        )
    try:
        response = httpx.post(
            f"{url}/extract",
            files={"file": (filename or "receipt", content, content_type or "application/octet-stream")},
            timeout=180,
        )
    except httpx.HTTPError as exc:
        raise AppError(503, "Serviciul OCR nu răspunde.") from exc
    if response.status_code >= 400:
        detail = "Serviciul OCR nu a putut citi bonul."
        try:
            body = response.json()
            if isinstance(body, dict) and body.get("detail"):
                detail = str(body["detail"])
        except ValueError:
            pass
        if detail.strip().lower() in {"internal server error", "internal server error."}:
            detail = "Serviciul OCR nu a putut citi bonul."
        raise AppError(503, detail)
    payload = response.json()
    occurred = payload.get("occurred_on")
    total = payload.get("total_amount")
    draft = ReceiptDraft(
        space_id=space.id,
        created_by=user.id,
        merchant=payload.get("merchant"),
        occurred_on=date.fromisoformat(occurred) if occurred else None,
        total_amount=q4(Decimal(str(total))) if total not in (None, "") else None,
        currency=(payload.get("currency") or "RON").strip().upper(),
        lines=payload.get("lines") or [],
        status="pending_review",
        created_at=now_utc(),
    )
    db.add(draft)
    db.flush()
    return draft


def save_draft(
    db: Session,
    *,
    space: Space,
    user: User,
    draft: ReceiptDraft,
    account: Account,
    category: Category,
    amount: str | None,
    occurred_on: date | None,
    description: str | None,
) -> uuid.UUID:
    if draft.space_id != space.id:
        raise AppError(404, "Ciorna nu există.")
    value = parse_positive(amount) if amount else draft.total_amount
    when = occurred_on or draft.occurred_on
    if value is None or when is None:
        raise AppError(422, "Completează suma și data bonului.")
    if category.kind != "expense":
        raise AppError(422, "Bonul se salvează ca cheltuială.")
    tx = create_transaction(
        db,
        space=space,
        actor_id=user.id,
        kind="expense",
        amount=q4(value),
        account=account,
        category=category,
        counter_account=None,
        counter_amount=None,
        occurred_on=when,
        description=description if description is not None else (draft.merchant or ""),
        goal=None,
        fx_rate=None,
        origin="ocr",
    )
    db.delete(draft)
    return tx.id
