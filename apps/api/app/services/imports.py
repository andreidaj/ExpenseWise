from __future__ import annotations

import csv
import hashlib
import io
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Account, Category, ImportBatch, ImportRow, Space, Transaction, User
from app.money import now_utc, q4
from app.services.audit import audit
from app.services.ledger import create_transaction

ALIASES = {
    "date": {"date", "data", "occurred_on", "occurred"},
    "amount": {"amount", "suma", "sum", "valoare"},
    "currency": {"currency", "moneda", "currency_code"},
    "description": {"description", "descriere", "detalii", "memo"},
    "account": {"account", "cont", "account_name"},
    "category": {"category", "categorie"},
    "kind": {"kind", "fel", "tip", "type"},
}


def fingerprint(occurred: date, amount: Decimal, currency: str, description: str, account_id: uuid.UUID) -> str:
    desc = " ".join(description.casefold().split())
    material = "|".join(
        [occurred.isoformat(), f"{q4(amount):.4f}", currency.strip().upper(), desc, str(account_id)]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _parse_date(value: str) -> date | None:
    text = value.strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(value: str) -> Decimal | None:
    text = value.strip().replace(" ", "")
    if not text:
        return None
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        amount = Decimal(text)
    except InvalidOperation:
        return None
    if amount <= 0:
        return None
    return q4(amount)


def _rows_from_file(filename: str, content: bytes) -> list[dict[str, str]]:
    lower = filename.lower()
    if lower.endswith(".xlsx"):
        book = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        sheet = book.active
        grid = [[("" if cell is None else str(cell).strip()) for cell in row] for row in sheet.iter_rows(values_only=True)]
        book.close()
    else:
        decoded = content.decode("utf-8-sig")
        grid = [[cell.strip() for cell in row] for row in csv.reader(io.StringIO(decoded))]
    if not grid:
        raise AppError(422, "Fișierul este gol.")
    headers = [cell.casefold() for cell in grid[0]]
    records = []
    for raw in grid[1:]:
        if not any(raw):
            continue
        records.append({headers[index]: raw[index] if index < len(raw) else "" for index in range(len(headers))})
    return records


def _header_map(headers: set[str], mapping: dict | None) -> dict[str, str]:
    resolved = {}
    if mapping:
        for key, column in mapping.items():
            if key in ALIASES and column:
                resolved[key] = str(column).casefold()
    for key, names in ALIASES.items():
        if key in resolved:
            continue
        for name in names:
            if name in headers:
                resolved[key] = name
                break
    return resolved


def preview_import(
    db: Session,
    *,
    space: Space,
    user: User,
    filename: str,
    content: bytes,
    mapping: dict | None,
) -> ImportBatch:
    records = _rows_from_file(filename, content)
    if not records:
        raise AppError(422, "Fișierul nu conține rânduri.")
    columns = _header_map(set(records[0]), mapping)
    batch = ImportBatch(
        space_id=space.id,
        filename=filename,
        status="preview",
        created_by=user.id,
        created_at=now_utc(),
    )
    db.add(batch)
    db.flush()
    accounts = {
        account.name.casefold(): account
        for account in db.scalars(select(Account).where(Account.space_id == space.id, Account.archived_at.is_(None))).all()
    }
    categories = {
        (category.kind, category.name.casefold()): category
        for category in db.scalars(select(Category).where(Category.space_id == space.id, Category.archived_at.is_(None))).all()
    }
    seen: set[str] = set()
    for number, record in enumerate(records, start=1):
        mapped, error, duplicate_of, digest = _map_row(db, space, record, columns, accounts, categories, seen)
        if digest and not error:
            seen.add(digest)
        db.add(
            ImportRow(
                batch_id=batch.id,
                row_number=number,
                raw=record,
                mapped=mapped | {"error": error, "duplicate": duplicate_of is not None or mapped.get("in_file_duplicate", False)},
                duplicate_of=duplicate_of,
                status="pending",
            )
        )
    db.flush()
    return batch


def _map_row(db, space, record, columns, accounts, categories, seen):
    def cell(key: str) -> str:
        column = columns.get(key)
        if not column:
            return ""
        return str(record.get(column, "")).strip()

    mapped: dict = {}
    occurred = _parse_date(cell("date"))
    amount = _parse_amount(cell("amount"))
    account = accounts.get(cell("account").casefold())
    kind = cell("kind").casefold() or "expense"
    if kind not in {"income", "expense"}:
        return mapped, "Tip invalid.", None, None
    category = categories.get((kind, cell("category").casefold()))
    currency = (cell("currency") or (account.currency.strip() if account else space.base_currency.strip())).upper()
    description = cell("description")
    if occurred is None or amount is None or account is None or category is None:
        mapped.update({"kind": kind, "description": description, "currency": currency})
        return mapped, "Rândul nu poate fi mapat (dată, sumă, cont sau categorie).", None, None
    if currency != account.currency.strip():
        return mapped, "Moneda nu corespunde contului.", None, None
    digest = fingerprint(occurred, amount, currency, description, account.id)
    existing = db.scalar(
        select(Transaction).where(
            Transaction.space_id == space.id,
            Transaction.import_fingerprint == digest,
            Transaction.deleted_at.is_(None),
        )
    )
    in_file = digest in seen
    mapped = {
        "kind": kind,
        "amount": f"{amount:.4f}",
        "currency": currency,
        "occurred_on": occurred.isoformat(),
        "description": description,
        "account_id": str(account.id),
        "category_id": str(category.id),
        "fingerprint": digest,
        "in_file_duplicate": in_file,
    }
    return mapped, None, existing.id if existing else None, digest


def confirm_import(db: Session, *, space: Space, user: User, batch: ImportBatch, row_ids: set[uuid.UUID] | None) -> dict:
    if batch.space_id != space.id:
        raise AppError(404, "Lotul nu există.")
    if batch.status != "preview":
        raise AppError(409, "Lotul a fost deja confirmat.")
    rows = db.scalars(select(ImportRow).where(ImportRow.batch_id == batch.id).order_by(ImportRow.row_number)).all()
    imported: list[str] = []
    skipped = 0
    for row in rows:
        mapped = row.mapped or {}
        duplicate = bool(mapped.get("duplicate")) or row.duplicate_of is not None
        error = mapped.get("error")
        chosen = row_ids is None or row.id in row_ids
        force = row_ids is not None and row.id in row_ids and duplicate
        if not chosen or error or (duplicate and not force):
            row.status = "skipped"
            skipped += 1
            continue
        account = db.get(Account, uuid.UUID(mapped["account_id"]))
        category = db.get(Category, uuid.UUID(mapped["category_id"]))
        occurred = date.fromisoformat(mapped["occurred_on"])
        amount = Decimal(mapped["amount"])
        digest = None if force else mapped.get("fingerprint")
        tx = create_transaction(
            db,
            space=space,
            actor_id=user.id,
            kind=mapped["kind"],
            amount=amount,
            account=account,
            category=category,
            counter_account=None,
            counter_amount=None,
            occurred_on=occurred,
            description=mapped.get("description") or "",
            goal=None,
            fx_rate=None,
            origin="import",
            import_fingerprint=digest,
        )
        row.status = "imported"
        imported.append(str(tx.id))
    batch.status = "confirmed"
    audit(
        db,
        action="confirm_import",
        user_id=user.id,
        space_id=space.id,
        entity_type="import_batch",
        entity_id=batch.id,
        detail={"imported": len(imported)},
    )
    return {"status": "confirmed", "imported": len(imported), "skipped": skipped, "transaction_ids": imported}
