from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from app.errors import AppError

BUCHAREST = ZoneInfo("Europe/Bucharest")
Q4 = Decimal("0.0001")
Q8 = Decimal("0.00000001")


def now_utc() -> datetime:
    return datetime.now(ZoneInfo("UTC"))


def today_bucharest() -> date:
    return datetime.now(BUCHAREST).date()


def add_months(day: date, months: int) -> date:
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day.day, last))


def advance_date(day: date, frequency: str) -> date:
    if frequency == "weekly":
        return day + timedelta(days=7)
    if frequency == "monthly":
        return add_months(day, 1)
    if frequency == "yearly":
        return add_months(day, 12)
    raise AppError(422, "Frecvență invalidă.")


def currency_code(value: str) -> str:
    code = value.strip().upper()
    if len(code) != 3 or not code.isalpha():
        raise AppError(422, "Codul monedei trebuie să aibă 3 litere.")
    return code


def parse_amount(value: object, *, allow_zero: bool = False, allow_negative: bool = False) -> Decimal:
    if isinstance(value, bool) or isinstance(value, float):
        raise AppError(422, "Suma trebuie trimisă ca text numeric, nu float.")
    if isinstance(value, Decimal):
        dec = value
    elif isinstance(value, int):
        dec = Decimal(value)
    elif isinstance(value, str):
        try:
            dec = Decimal(value.strip())
        except InvalidOperation as exc:
            raise AppError(422, "Sumă invalidă.") from exc
    else:
        raise AppError(422, "Sumă invalidă.")
    if dec.is_nan() or not dec.is_finite():
        raise AppError(422, "Sumă invalidă.")
    exponent = dec.as_tuple().exponent
    if isinstance(exponent, int) and exponent < -4:
        raise AppError(422, "Suma acceptă cel mult 4 zecimale.")
    dec = dec.quantize(Q4)
    if not allow_negative and dec < 0:
        raise AppError(422, "Suma nu poate fi negativă.")
    if not allow_zero and not allow_negative and dec <= 0:
        raise AppError(422, "Suma trebuie să fie mai mare decât 0.")
    if allow_zero and not allow_negative and dec < 0:
        raise AppError(422, "Suma nu poate fi negativă.")
    return dec


def parse_positive(value: object) -> Decimal:
    return parse_amount(value, allow_zero=False)


def parse_rate(value: object) -> Decimal:
    if isinstance(value, bool) or isinstance(value, float):
        raise AppError(422, "Cursul trebuie trimis ca text numeric, nu float.")
    if isinstance(value, Decimal):
        dec = value
    elif isinstance(value, int):
        dec = Decimal(value)
    elif isinstance(value, str):
        try:
            dec = Decimal(value.strip())
        except InvalidOperation as exc:
            raise AppError(422, "Curs invalid.") from exc
    else:
        raise AppError(422, "Curs invalid.")
    if dec.is_nan() or not dec.is_finite() or dec <= 0:
        raise AppError(422, "Cursul trebuie să fie mai mare decât 0.")
    exponent = dec.as_tuple().exponent
    if isinstance(exponent, int) and exponent < -8:
        raise AppError(422, "Cursul acceptă cel mult 8 zecimale.")
    return dec.quantize(Q8)


def q4(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Q4)


def fmt_amount(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return f"{q4(Decimal(value)):.4f}"


def fmt_rate(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return f"{Decimal(value).quantize(Q8):.8f}"


def fmt_percent(part: Decimal, whole: Decimal) -> str:
    if whole == 0:
        return "0.00"
    return f"{(part / whole * Decimal(100)).quantize(Decimal('0.01')):.2f}"


def month_bounds(year: int, month: int) -> tuple[date, date]:
    last = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last)


def period_bounds(year: int, month: int, start_day: int = 1) -> tuple[date, date]:
    """Intervalul care începe în `start_day` a lunii și se oprește în ziua dinaintea următoarei."""
    day = min(max(int(start_day), 1), 31)
    start = date(year, month, min(day, calendar.monthrange(year, month)[1]))
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    next_start = date(next_year, next_month, min(day, calendar.monthrange(next_year, next_month)[1]))
    return start, next_start - timedelta(days=1)
