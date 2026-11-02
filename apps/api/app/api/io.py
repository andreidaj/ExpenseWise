from __future__ import annotations

import json
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_db, get_verified_user, membership, require_role
from app.errors import AppError
from app.models import Account, Category, ImportBatch, ImportRow, ReceiptDraft, Transaction, User
from app.serialize import transaction_out
from app.services.imports import confirm_import, preview_import
from app.services.receipts import create_draft, save_draft

router = APIRouter(tags=["import"])


class ConfirmIn(BaseModel):
    row_ids: list[uuid.UUID] | None = None
    include_row_ids: list[uuid.UUID] | None = None


class SaveReceipt(BaseModel):
    account_id: uuid.UUID
    category_id: uuid.UUID
    amount: str | None = None
    occurred_on: str | None = None
    description: str | None = None


def _row_out(row: ImportRow) -> dict:
    mapped = row.mapped or {}
    hidden = {"error", "duplicate", "similar", "outside", "in_file_duplicate", "fingerprint"}
    return {
        "id": str(row.id),
        "row_number": row.row_number,
        "status": row.status,
        "duplicate": bool(mapped.get("duplicate")),
        "duplicate_of": str(row.duplicate_of) if row.duplicate_of else None,
        "similar": mapped.get("similar"),
        "outside": bool(mapped.get("outside")),
        "error": mapped.get("error"),
        "mapped": {key: value for key, value in mapped.items() if key not in hidden},
    }


def _form_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise AppError(422, "Data perioadei este invalidă.") from exc


def _form_uuid(value: str | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


@router.post("/spaces/{space_id}/imports", status_code=201)
async def post_import(
    space_id: uuid.UUID,
    file: UploadFile = File(...),
    mapping: str | None = Form(None),
    account_id: str | None = Form(None),
    category_id: str | None = Form(None),
    kind: str | None = Form(None),
    date_from: str | None = Form(None),
    date_to: str | None = Form(None),
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "editor")
    start = _form_date(date_from)
    end = _form_date(date_to)
    if (start is None) != (end is None):
        raise AppError(422, "Perioada cere ambele date.")
    if start is not None and end is not None and start > end:
        raise AppError(422, "Data de început este după data de sfârșit.")
    content = await file.read()
    parsed = json.loads(mapping) if mapping else None
    batch = preview_import(
        db,
        space=space,
        user=user,
        filename=file.filename or "import.csv",
        content=content,
        mapping=parsed,
        account_id=_form_uuid(account_id),
        category_id=_form_uuid(category_id),
        default_kind=kind,
        date_from=start,
        date_to=end,
    )
    rows = db.scalars(select(ImportRow).where(ImportRow.batch_id == batch.id).order_by(ImportRow.row_number)).all()
    return {"id": str(batch.id), "filename": batch.filename, "status": batch.status, "rows": [_row_out(row) for row in rows]}


@router.post("/spaces/{space_id}/imports/{batch_id}/confirm")
def post_confirm(
    space_id: uuid.UUID,
    batch_id: uuid.UUID,
    body: ConfirmIn | None = None,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "editor")
    batch = db.get(ImportBatch, batch_id)
    if batch is None or batch.space_id != space.id:
        raise AppError(404, "Lotul nu există.")
    chosen = None
    if body is not None and body.row_ids is not None:
        chosen = set(body.row_ids)
    elif body is not None and body.include_row_ids is not None:
        chosen = set(body.include_row_ids)
    ids = chosen
    return confirm_import(db, space=space, user=user, batch=batch, row_ids=ids)


@router.post("/spaces/{space_id}/receipts", status_code=201)
async def post_receipt(
    space_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "editor")
    content = await file.read()
    draft = create_draft(
        db,
        space=space,
        user=user,
        filename=file.filename or "receipt",
        content=content,
        content_type=file.content_type or "application/octet-stream",
    )
    return {
        "id": str(draft.id),
        "merchant": draft.merchant,
        "occurred_on": draft.occurred_on.isoformat() if draft.occurred_on else None,
        "total_amount": f"{draft.total_amount:.4f}" if draft.total_amount is not None else None,
        "currency": draft.currency.strip() if draft.currency else None,
        "lines": draft.lines,
        "status": draft.status,
    }


@router.post("/spaces/{space_id}/receipts/{draft_id}/save", status_code=201)
def post_save(
    space_id: uuid.UUID,
    draft_id: uuid.UUID,
    body: SaveReceipt,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    from datetime import date

    space, member = membership(db, space_id, user)
    require_role(member, "editor")
    draft = db.get(ReceiptDraft, draft_id)
    if draft is None or draft.space_id != space.id:
        raise AppError(404, "Ciorna nu există.")
    account = db.get(Account, body.account_id)
    category = db.get(Category, body.category_id)
    if account is None or account.space_id != space.id or category is None or category.space_id != space.id:
        raise AppError(422, "Contul sau categoria nu aparțin spațiului.")
    occurred = date.fromisoformat(body.occurred_on) if body.occurred_on else None
    tx_id = save_draft(
        db,
        space=space,
        user=user,
        draft=draft,
        account=account,
        category=category,
        amount=body.amount,
        occurred_on=occurred,
        description=body.description,
    )
    tx = db.get(Transaction, tx_id)
    return transaction_out(tx)
