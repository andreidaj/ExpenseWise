from __future__ import annotations

import csv
import hashlib
import io
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Account, Category, ImportBatch, ImportRow, Space, Transaction, User
from app.money import now_utc, q4
from app.services.audit import audit
from app.services.ledger import create_transaction
from app.services.statements import fold, normalize_grid

ALIASES = {
    "date": {"date", "data", "occurred_on", "occurred"},
    "amount": {"amount", "suma", "sum", "valoare"},
    "currency": {"currency", "moneda", "currency_code"},
    "description": {"description", "descriere", "detalii", "memo"},
    "account": {"account", "cont", "account_name"},
    "category": {"category", "categorie"},
    "kind": {"kind", "fel", "tip", "type"},
}

_KINDS = {
    "expense": "expense",
    "cheltuiala": "expense",
    "income": "income",
    "venit": "income",
    "incasare": "income",
}


def fingerprint(occurred: date, amount: Decimal, currency: str, description: str, account_id: uuid.UUID) -> str:
    desc = " ".join(description.casefold().split())
    material = "|".join(
        [occurred.isoformat(), f"{q4(amount):.4f}", currency.strip().upper(), desc, str(account_id)]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _parse_date(value: str) -> date | None:
    text = value.strip()
    if " " in text:
        text = text.split(" ", 1)[0]
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y"):
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
    grid = _grid_from_file(filename, content)
    if not grid:
        raise AppError(422, "Fișierul este gol.")
    recognized = normalize_grid(grid)
    if recognized is not None:
        return [row for row in recognized if any(row.values())]
    headers = [cell.casefold() for cell in grid[0]]
    records = []
    for raw in grid[1:]:
        if not any(raw):
            continue
        records.append({headers[index]: raw[index] if index < len(raw) else "" for index in range(len(headers))})
    return records


def _grid_from_file(filename: str, content: bytes) -> list[list[str]]:
    if not content.strip():
        raise AppError(422, "Fișierul este gol.")
    if content.startswith(b"PK") or filename.lower().endswith(".xlsx"):
        return _xlsx_grid(content)
    if content.startswith(b"\xd0\xcf\x11\xe0"):
        return _xls_grid(content)
    if _looks_html(content):
        return _html_grid(content)
    decoded = _decode_text(content)
    return [[cell.strip() for cell in row] for row in csv.reader(io.StringIO(decoded))]


def _xlsx_grid(content: bytes) -> list[list[str]]:
    try:
        book = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        raise AppError(422, "Fișierul Excel nu poate fi citit.") from exc
    sheet = book.active
    grid = [[("" if cell is None else str(cell).strip()) for cell in row] for row in sheet.iter_rows(values_only=True)]
    book.close()
    return grid


def _xls_grid(content: bytes) -> list[list[str]]:
    try:
        import xlrd
    except ImportError as exc:
        raise AppError(422, "Fișierul Excel vechi nu poate fi citit.") from exc
    try:
        book = xlrd.open_workbook(file_contents=content)
    except xlrd.XLRDError as exc:
        raise AppError(422, "Fișierul Excel nu poate fi citit.") from exc
    sheet = book.sheet_by_index(0)
    return [[_xls_text(sheet.cell(row, column), book.datemode) for column in range(sheet.ncols)] for row in range(sheet.nrows)]


def _xls_text(cell: object, datemode: int) -> str:
    import xlrd

    kind = getattr(cell, "ctype", None)
    value = getattr(cell, "value", "")
    if kind == xlrd.XL_CELL_DATE:
        try:
            parsed = xlrd.xldate_as_datetime(value, datemode)
        except Exception:
            return ""
        if parsed.hour or parsed.minute or parsed.second:
            return parsed.strftime("%Y-%m-%d %H:%M:%S")
        return parsed.strftime("%d.%m.%Y")
    if kind == xlrd.XL_CELL_NUMBER:
        if value == int(value):
            return str(int(value))
        return f"{value:.2f}"
    if kind in {xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK}:
        return ""
    return str(value).strip()


def _looks_html(content: bytes) -> bool:
    sample = content.lstrip()[:500].lower()
    return sample.startswith(b"<") or b"<table" in sample or b"<html" in sample


class _HtmlTable(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.grid: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        name = tag.lower().rsplit(":", 1)[-1]
        if name == "tr" or name == "row":
            self._row = []
        elif name in {"td", "th", "cell"} and self._row is not None:
            raw = {key.lower(): value or "" for key, value in attrs}
            index = raw.get("ss:index") or raw.get("index") or ""
            if index.isdigit():
                target = int(index) - 1
                while len(self._row) < target:
                    self._row.append("")
            self._cell = []
        elif name in {"script", "style"}:
            self._skip += 1

    def handle_endtag(self, tag: str) -> None:
        name = tag.lower().rsplit(":", 1)[-1]
        if name in {"script", "style"} and self._skip:
            self._skip -= 1
        elif name in {"td", "th", "cell"} and self._cell is not None and self._row is not None:
            self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif name in {"tr", "row"} and self._row is not None:
            if any(self._row):
                self.grid.append(self._row)
            self._row = None

    def handle_data(self, data: str) -> None:
        if self._skip == 0 and self._cell is not None:
            self._cell.append(data)


def _html_grid(content: bytes) -> list[list[str]]:
    parser = _HtmlTable()
    parser.feed(_decode_text(content))
    return parser.grid


def _decode_text(content: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1250"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("latin-1")


def _header_map(headers: set[str], mapping: dict | None) -> dict[str, str]:
    resolved = {}
    if mapping:
        for raw_key, column in mapping.items():
            key = "date" if raw_key == "occurred_on" else raw_key
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
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    default_kind: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
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
    fallback_account = db.get(Account, account_id) if account_id else None
    if fallback_account is not None and (fallback_account.space_id != space.id or fallback_account.archived_at is not None):
        fallback_account = None
    fallback_category = db.get(Category, category_id) if category_id else None
    if fallback_category is not None and (fallback_category.space_id != space.id or fallback_category.archived_at is not None):
        fallback_category = None
    for number, record in enumerate(records, start=1):
        mapped, error, duplicate_of, digest = _map_row(
            db,
            space,
            record,
            columns,
            accounts,
            categories,
            seen,
            fallback_account,
            fallback_category,
            _KINDS.get(fold(default_kind or ""), ""),
        )
        outside = False
        if error is None and date_from is not None and date_to is not None and mapped.get("occurred_on"):
            occurred = date.fromisoformat(mapped["occurred_on"])
            if occurred < date_from or occurred > date_to:
                error = "În afara perioadei."
                outside = True
        if digest and not error:
            seen.add(digest)
        db.add(
            ImportRow(
                batch_id=batch.id,
                row_number=number,
                raw=record,
                mapped=mapped
                | {
                    "error": error,
                    "outside": outside,
                    "duplicate": duplicate_of is not None or mapped.get("in_file_duplicate", False),
                },
                duplicate_of=duplicate_of,
                status="pending",
            )
        )
    db.flush()
    return batch


def _map_row(db, space, record, columns, accounts, categories, seen, fallback_account, fallback_category, default_kind):
    def cell(key: str) -> str:
        column = columns.get(key)
        if not column:
            return ""
        return str(record.get(column, "")).strip()

    mapped: dict = {}
    occurred = _parse_date(cell("date"))
    amount = _parse_amount(cell("amount"))
    account_name = cell("account")
    account = accounts.get(account_name.casefold()) if account_name else fallback_account
    kind = _KINDS.get(fold(cell("kind")), "") or default_kind or "expense"
    if kind not in {"income", "expense"}:
        return mapped, "Tip invalid.", None, None
    category_name = cell("category")
    category = categories.get((kind, category_name.casefold())) if category_name else None
    if category is None and not category_name:
        if fallback_category is not None and fallback_category.kind == kind:
            category = fallback_category
        else:
            category = categories.get((kind, "altele"))
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
    similar = _closest_similar(db, space.id, account.id, amount, currency, occurred, existing)
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
        "similar": _similar_out(similar),
    }
    return mapped, None, existing.id if existing else None, digest


def _closest_similar(db, space_id, account_id, amount, currency, occurred: date, exact: Transaction | None) -> Transaction | None:
    if exact is not None:
        return exact
    window_start = occurred - timedelta(days=2)
    window_end = occurred + timedelta(days=2)
    rows = db.scalars(
        select(Transaction).where(
            Transaction.space_id == space_id,
            Transaction.account_id == account_id,
            Transaction.deleted_at.is_(None),
            Transaction.amount == amount,
            Transaction.currency == currency,
            Transaction.kind.in_(("income", "expense")),
            Transaction.occurred_on >= window_start,
            Transaction.occurred_on <= window_end,
        )
    ).all()
    if not rows:
        return None
    return min(rows, key=lambda tx: abs((tx.occurred_on - occurred).days))


def _similar_out(tx: Transaction | None) -> dict | None:
    if tx is None:
        return None
    return {
        "id": str(tx.id),
        "occurred_on": tx.occurred_on.isoformat(),
        "amount": f"{tx.amount:.4f}",
        "currency": tx.currency.strip(),
        "description": tx.description,
        "kind": tx.kind,
    }


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
        warned = bool(mapped.get("duplicate")) or bool(mapped.get("similar")) or row.duplicate_of is not None
        error = mapped.get("error")
        chosen = row_ids is None or row.id in row_ids
        force = row_ids is not None and row.id in row_ids and warned
        if not chosen or error or (warned and not force):
            row.status = "skipped"
            skipped += 1
            continue
        account = db.get(Account, uuid.UUID(mapped["account_id"]))
        category = db.get(Category, uuid.UUID(mapped["category_id"]))
        occurred = date.fromisoformat(mapped["occurred_on"])
        amount = Decimal(mapped["amount"])
        exact = row.duplicate_of is not None or bool(mapped.get("in_file_duplicate"))
        digest = None if force and exact else mapped.get("fingerprint")
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
