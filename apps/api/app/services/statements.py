from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation

_DIACRITICS = str.maketrans(
    {
        "ă": "a",
        "â": "a",
        "î": "i",
        "ș": "s",
        "ş": "s",
        "ț": "t",
        "ţ": "t",
        "Ă": "a",
        "Â": "a",
        "Î": "i",
        "Ș": "s",
        "Ş": "s",
        "Ț": "t",
        "Ţ": "t",
    }
)
_MONTHS = {
    "ianuarie": 1,
    "februarie": 2,
    "martie": 3,
    "aprilie": 4,
    "mai": 5,
    "iunie": 6,
    "iulie": 7,
    "august": 8,
    "septembrie": 9,
    "octombrie": 10,
    "noiembrie": 11,
    "decembrie": 12,
}
_SKIP_STATES = {"failed", "reverted", "reversed", "cancelled", "canceled"}
_DETAIL_LABELS = ("tranzactie la", "ordonator", "beneficiar", "detalii", "terminal")


def fold(value: str) -> str:
    return " ".join(value.translate(_DIACRITICS).casefold().split())


_BALANCE = ("soldul zilei", "sold initial", "sold final", "sold disponibil", "rulaj debitor", "rulaj creditor")
_BOOKED = ("data inregistrarii", "data inregistrare")
_TRADED = ("data tranzactiei", "data tranzactie")
_DETAILS = ("descrierea tranzactiei", "descriere tranzactie", "descrierea", "detalii", "descriere")


def normalize_grid(grid: list[list[str]]) -> list[dict[str, str]] | None:
    revolut = _revolut(grid)
    if revolut is not None:
        return revolut
    raiffeisen = _raiffeisen(grid)
    if raiffeisen is not None:
        return raiffeisen
    return _ing(grid)


def _cell(row: list[str], index: int | None) -> str:
    if index is None or index < 0 or index >= len(row):
        return ""
    return row[index].strip()


def _find(header: list[str], name: str) -> int | None:
    target = fold(name)
    for index, cell in enumerate(header):
        if fold(cell) == target:
            return index
    return None


def _find_any(header: list[str], names: tuple[str, ...]) -> int | None:
    for name in names:
        found = _find(header, name)
        if found is not None:
            return found
    return None


def _signed(value: str) -> Decimal | None:
    text = value.strip().replace(" ", "").replace("\u00a0", "")
    if not text:
        return None
    negative = text.startswith("-") or (text.startswith("(") and text.endswith(")"))
    text = text.strip("()")
    if text.startswith("+") or text.startswith("-"):
        text = text[1:]
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
    if negative:
        amount = -amount
    return amount


def _positive(value: str) -> str:
    amount = _signed(value)
    if amount is None:
        return ""
    amount = abs(amount)
    if amount == 0:
        return ""
    return f"{amount:.2f}"


def _date(value: str) -> str:
    text = fold(value)
    if not text:
        return ""
    iso = re.match(r"(\d{4})-(\d{2})-(\d{2})", text)
    if iso:
        return f"{iso.group(1)}-{iso.group(2)}-{iso.group(3)}"
    numeric = re.match(r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})", text)
    if numeric:
        day, month, year = int(numeric.group(1)), int(numeric.group(2)), int(numeric.group(3))
        return _safe_date(year, month, day)
    words = re.match(r"(\d{1,2})\s+([a-z]+)\s+(\d{4})", text)
    if words:
        month = _MONTHS.get(words.group(2))
        if month:
            return _safe_date(int(words.group(3)), month, int(words.group(1)))
    return ""


def _safe_date(year: int, month: int, day: int) -> str:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return ""


def _row(when: str, amount: str, currency: str, description: str, kind: str) -> dict[str, str]:
    return {
        "data": when,
        "suma": amount,
        "moneda": currency or "RON",
        "descriere": " ".join(description.split()),
        "tip": kind,
    }


def _revolut(grid: list[list[str]]) -> list[dict[str, str]] | None:
    header_at = next((index for index, row in enumerate(grid) if _revolut_header(row)), None)
    if header_at is None:
        return None
    header = grid[header_at]
    started = _find(header, "started date")
    completed = _find(header, "completed date")
    amount_col = _find(header, "amount")
    fee_col = _find(header, "fee")
    currency_col = _find(header, "currency")
    description_col = _find(header, "description")
    state_col = _find(header, "state")
    type_col = _find(header, "type")
    records: list[dict[str, str]] = []
    for row in grid[header_at + 1 :]:
        if not any(cell.strip() for cell in row):
            continue
        state = fold(_cell(row, state_col))
        if state in _SKIP_STATES:
            continue
        when = _date(_cell(row, completed)) or _date(_cell(row, started))
        signed = _signed(_cell(row, amount_col))
        fee = _signed(_cell(row, fee_col)) or Decimal(0)
        if when == "" or signed is None:
            continue
        description = _cell(row, description_col) or _cell(row, type_col) or "Revolut"
        currency = (_cell(row, currency_col) or "RON").upper()
        if signed < 0:
            total = abs(signed) + (fee if fee > 0 else Decimal(0))
            records.append(_row(when, f"{total:.2f}", currency, description, "expense"))
        elif signed > 0:
            records.append(_row(when, f"{signed:.2f}", currency, description, "income"))
            if fee > 0:
                records.append(_row(when, f"{fee:.2f}", currency, f"Comision · {description}", "expense"))
        elif fee > 0:
            records.append(_row(when, f"{fee:.2f}", currency, f"Comision · {description}", "expense"))
    return records


def _raiffeisen(grid: list[list[str]]) -> list[dict[str, str]] | None:
    header_at = next((index for index, row in enumerate(grid) if _raiffeisen_header(row)), None)
    if header_at is None:
        return None
    header = grid[header_at]
    booked = _find_any(header, _BOOKED)
    traded = _find_any(header, _TRADED)
    detail_col = _find_any(header, _DETAILS)
    debit_col = _find(header, "suma debit")
    credit_col = _find(header, "suma credit")
    amount_col = None if debit_col is not None or credit_col is not None else _find(header, "suma")
    currency = _statement_currency(grid)
    records: list[dict[str, str]] = []
    current: dict[str, str] | None = None

    def finish() -> None:
        nonlocal current
        if current is not None:
            records.append(current)
            current = None

    for row in grid[header_at + 1 :]:
        if not any(cell.strip() for cell in row) or _is_balance(row):
            continue
        when = _date(_cell(row, booked)) or _date(_cell(row, traded))
        detail = _cell(row, detail_col)
        if amount_col is None:
            debit = _positive(_cell(row, debit_col))
            credit = _positive(_cell(row, credit_col))
            amount, kind = (debit, "expense") if debit else (credit, "income")
        else:
            signed = _signed(_cell(row, amount_col))
            if signed is None or signed == 0:
                amount, kind = "", ""
            elif signed < 0:
                amount, kind = f"{abs(signed):.2f}", "expense"
            else:
                amount, kind = f"{signed:.2f}", "income"
        if when and amount:
            finish()
            current = _row(when, amount, currency, detail or "Raiffeisen", kind)
            continue
        if current is not None and detail and not when:
            current["descriere"] = " ".join(f"{current['descriere']} · {detail}".split())
    finish()
    return records


def _raiffeisen_header(row: list[str]) -> bool:
    booked = _find_any(row, _BOOKED) is not None or _find_any(row, _TRADED) is not None
    split = _find(row, "suma debit") is not None or _find(row, "suma credit") is not None
    single = _find_any(row, _DETAILS) is not None and _find(row, "suma") is not None
    return booked and (split or single)


def _is_balance(row: list[str]) -> bool:
    folded = fold(" ".join(row))
    return any(phrase in folded for phrase in _BALANCE)


def _statement_currency(grid: list[list[str]]) -> str:
    for row in grid:
        for cell in row:
            match = re.search(r"\bvaluta\b\s*[:\-]?\s*([a-z]+)", fold(cell))
            if not match:
                continue
            word = match.group(1)
            if word in {"lei", "ron"}:
                return "RON"
            if word == "euro":
                return "EUR"
            if len(word) == 3 and word.isalpha():
                return word.upper()
    return "RON"


def _revolut_header(row: list[str]) -> bool:
    cells = {fold(cell) for cell in row}
    return "amount" in cells and "description" in cells and ("started date" in cells or "completed date" in cells)


def _ing(grid: list[list[str]]) -> list[dict[str, str]] | None:
    if not any(_ing_header(row) for row in grid):
        return None
    columns: dict[str, int] | None = None
    current: dict | None = None
    records: list[dict[str, str]] = []

    def finish() -> None:
        nonlocal current
        if current is None:
            return
        records.append(
            _row(current["date"], current["amount"], "RON", _ing_description(current), current["kind"])
        )
        current = None

    for row in grid:
        if _ing_header(row):
            finish()
            columns = {
                "data": _find(row, "data") or 0,
                "detalii": _find(row, "detalii tranzactie") if _find(row, "detalii tranzactie") is not None else 3,
                "debit": _find(row, "debit") or 0,
                "credit": _find(row, "credit") or 0,
            }
            continue
        if columns is None:
            continue
        when = _date(_cell(row, columns["data"]))
        debit = _positive(_cell(row, columns["debit"]))
        credit = _positive(_cell(row, columns["credit"]))
        detail = _cell(row, columns["detalii"])
        if when and (debit or credit):
            finish()
            current = {
                "date": when,
                "amount": debit or credit,
                "kind": "expense" if debit else "income",
                "title": detail,
                "merchant": "",
                "extras": [],
            }
            continue
        if current is None or not detail:
            continue
        label, rest = _detail_label(detail)
        if label == "tranzactie la":
            current["merchant"] = rest
        elif label in {"ordonator", "beneficiar", "detalii", "terminal"} and rest:
            current["extras"].append(rest)
    finish()
    return records


def _ing_header(row: list[str]) -> bool:
    cells = {fold(cell) for cell in row}
    return "data" in cells and "debit" in cells and "credit" in cells


def _detail_label(text: str) -> tuple[str, str]:
    folded = fold(text)
    for label in _DETAIL_LABELS:
        if folded.startswith(label):
            rest = text.split(":", 1)[1].strip() if ":" in text else ""
            return label, rest
    return "", text.strip()


def _ing_description(current: dict) -> str:
    title = str(current.get("title") or "").strip()
    merchant = str(current.get("merchant") or "").strip()
    extras = [str(item).strip() for item in current.get("extras") or [] if str(item).strip()]
    if merchant:
        head = merchant if not title or fold(title) in fold(merchant) else f"{title} · {merchant}"
    else:
        head = title or "ING"
    if extras:
        return " · ".join([head, *extras])
    return head
