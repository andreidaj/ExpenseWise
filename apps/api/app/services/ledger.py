from __future__ import annotations

import os
import threading
import uuid
from datetime import date
from decimal import Decimal

import httpx
from sqlalchemy import delete, or_, select, text, update
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import (
    Account,
    Budget,
    Category,
    ExchangeRate,
    Goal,
    ImportBatch,
    ReceiptDraft,
    RecurringRule,
    Space,
    SpaceInvitation,
    SpaceMember,
    Transaction,
)
from app.money import (
    advance_date,
    currency_code,
    fmt_amount,
    period_bounds,
    now_utc,
    parse_positive,
    parse_rate,
    q4,
    today_bucharest,
)
from app.serialize import account_out, category_out
from app.services.audit import audit

ZERO = Decimal("0.0000")


def _code(value: str) -> str:
    return value.strip().upper()


def _load_account(db: Session, space_id: uuid.UUID, account_id: uuid.UUID) -> Account:
    account = db.get(Account, account_id)
    if account is None or account.space_id != space_id:
        raise AppError(422, "Contul nu aparține spațiului.")
    return account


def _load_category(db: Session, space_id: uuid.UUID, category_id: uuid.UUID) -> Category:
    category = db.get(Category, category_id)
    if category is None or category.space_id != space_id:
        raise AppError(422, "Categoria nu aparține spațiului.")
    return category


def _load_goal(db: Session, space_id: uuid.UUID, goal_id: uuid.UUID | None) -> Goal | None:
    if goal_id is None:
        return None
    goal = db.get(Goal, goal_id)
    if goal is None or goal.space_id != space_id:
        raise AppError(422, "Obiectivul nu aparține spațiului.")
    return goal


def _lookup_rate(db: Session, base: str, quote: str, on: date, source: str) -> ExchangeRate | None:
    return db.scalar(
        select(ExchangeRate).where(
            ExchangeRate.base_currency == base,
            ExchangeRate.quote_currency == quote,
            ExchangeRate.rate_date == on,
            ExchangeRate.source == source,
        )
    )


def _save_rate(
    db: Session,
    *,
    base: str,
    quote: str,
    on: date,
    rate: Decimal,
    source: str,
    user_id: uuid.UUID | None,
) -> ExchangeRate:
    existing = _lookup_rate(db, base, quote, on, source)
    if existing is not None:
        existing.rate = rate
        return existing
    row = ExchangeRate(
        base_currency=base,
        quote_currency=quote,
        rate_date=on,
        rate=rate,
        source=source,
        created_by=user_id,
        created_at=now_utc(),
    )
    db.add(row)
    db.flush()
    return row


class _FxCall:
    def __init__(self) -> None:
        self.event = threading.Event()
        self.result: tuple[Decimal, date] | None = None


_fx_guard = threading.Lock()
_fx_cache: dict[tuple[str, str, str], tuple[Decimal, date]] = {}
_fx_inflight: dict[tuple[str, str, str], _FxCall] = {}


def _request_frankfurter(base: str, quote: str, on: date) -> tuple[Decimal, date] | None:
    root = os.environ.get("FRANKFURTER_URL", "https://api.frankfurter.app").rstrip("/")
    url = f"{root}/{on.isoformat()}"
    try:
        response = httpx.get(url, params={"from": base, "to": quote}, timeout=10)
    except httpx.HTTPError:
        return None
    if response.status_code != 200:
        return None
    body = response.json()
    raw = (body.get("rates") or {}).get(quote)
    if raw is None:
        return None
    rate = parse_rate(str(raw))
    rate_day = date.fromisoformat(body.get("date") or on.isoformat())
    return rate, rate_day


def fetch_frankfurter(base: str, quote: str, on: date) -> tuple[Decimal, date] | None:
    base = _code(base)
    quote = _code(quote)
    key = (base, quote, on.isoformat())
    with _fx_guard:
        cached = _fx_cache.get(key)
        if cached is not None:
            return cached
        slot = _fx_inflight.get(key)
        if slot is None:
            slot = _FxCall()
            _fx_inflight[key] = slot
            leader = True
        else:
            leader = False
    if not leader:
        slot.event.wait(12)
        return slot.result
    try:
        result = _request_frankfurter(base, quote, on)
        if result is not None:
            with _fx_guard:
                _fx_cache[key] = result
        slot.result = result
        return result
    finally:
        with _fx_guard:
            _fx_inflight.pop(key, None)
        slot.event.set()


def resolve_fx(
    db: Session,
    *,
    space: Space,
    currency: str,
    occurred_on: date,
    explicit: Decimal | None,
    user_id: uuid.UUID | None,
) -> tuple[Decimal | None, date | None, str | None]:
    base = _code(space.base_currency)
    currency = _code(currency)
    if currency == base:
        return None, None, None
    if explicit is not None:
        rate = parse_rate(explicit) if not isinstance(explicit, Decimal) else explicit.quantize(Decimal("0.00000001"))
        _save_rate(db, base=currency, quote=base, on=occurred_on, rate=rate, source="manual", user_id=user_id)
        return rate, occurred_on, "manual"
    manual = _lookup_rate(db, currency, base, occurred_on, "manual")
    if manual is not None:
        return manual.rate, manual.rate_date, "manual"
    cached = _lookup_rate(db, currency, base, occurred_on, "frankfurter")
    if cached is not None:
        return cached.rate, cached.rate_date, "frankfurter"
    fetched = fetch_frankfurter(currency, base, occurred_on)
    if fetched is None:
        return None, None, None
    rate, rate_day = fetched
    _save_rate(db, base=currency, quote=base, on=occurred_on, rate=rate, source="frankfurter", user_id=None)
    if rate_day != occurred_on:
        _save_rate(db, base=currency, quote=base, on=rate_day, rate=rate, source="frankfurter", user_id=None)
    return rate, rate_day, "frankfurter"


def set_manual_rate(
    db: Session,
    *,
    user_id: uuid.UUID,
    base_currency: str,
    quote_currency: str,
    rate_date: date,
    rate: Decimal,
) -> ExchangeRate:
    return _save_rate(
        db,
        base=currency_code(base_currency),
        quote=currency_code(quote_currency),
        on=rate_date,
        rate=rate,
        source="manual",
        user_id=user_id,
    )


def amount_in_currency(db: Session, tx: Transaction, space: Space, target: str) -> Decimal | None:
    source = _code(tx.currency)
    target = _code(target)
    base = _code(space.base_currency)
    if source == target:
        return q4(tx.amount)
    if target == base and tx.fx_rate is not None:
        return q4(tx.amount * tx.fx_rate)
    if source == base:
        rate = _lookup_rate(db, source, target, tx.occurred_on, "manual") or _lookup_rate(
            db, source, target, tx.occurred_on, "frankfurter"
        )
        if rate is None:
            return None
        return q4(tx.amount * rate.rate)
    if tx.fx_rate is not None:
        bridge = _lookup_rate(db, base, target, tx.occurred_on, "manual") or _lookup_rate(
            db, base, target, tx.occurred_on, "frankfurter"
        )
        if bridge is None:
            return None
        return q4(tx.amount * tx.fx_rate * bridge.rate)
    return None


def create_transaction(
    db: Session,
    *,
    space: Space,
    actor_id: uuid.UUID,
    kind: str,
    amount: Decimal,
    account: Account,
    category: Category | None,
    counter_account: Account | None,
    counter_amount: Decimal | None,
    occurred_on: date,
    description: str,
    goal: Goal | None,
    fx_rate: Decimal | None,
    origin: str,
    import_fingerprint: str | None = None,
    recurring_rule_id: uuid.UUID | None = None,
) -> Transaction:
    if kind not in {"income", "expense", "transfer"}:
        raise AppError(422, "Tip de tranzacție invalid.")
    if amount <= 0:
        raise AppError(422, "Suma trebuie să fie mai mare decât 0.")
    if account.space_id != space.id:
        raise AppError(422, "Contul nu aparține spațiului.")
    currency = _code(account.currency)
    counter_currency = None
    if kind == "transfer":
        if counter_account is None or counter_account.space_id != space.id:
            raise AppError(422, "Transferul cere un cont destinație din același spațiu.")
        if counter_account.id == account.id:
            raise AppError(422, "Conturile transferului trebuie să fie diferite.")
        if category is not None:
            raise AppError(422, "Transferul nu are categorie.")
        counter_currency = _code(counter_account.currency)
        if counter_currency == currency:
            if counter_amount is not None and q4(counter_amount) != q4(amount):
                raise AppError(422, "Transferul în aceeași monedă folosește aceeași sumă.")
            counter_amount = q4(amount)
        else:
            if counter_amount is None or counter_amount <= 0:
                raise AppError(422, "Transferul între monede cere suma din contul destinație.")
            counter_amount = q4(counter_amount)
    else:
        if counter_account is not None:
            raise AppError(422, "Doar transferul are cont destinație.")
        if category is None or category.space_id != space.id:
            raise AppError(422, "Tranzacția cere o categorie din spațiu.")
        if category.kind != kind:
            raise AppError(422, "Categoria nu are același tip cu tranzacția.")
        counter_amount = None
    if goal is not None and goal.space_id != space.id:
        raise AppError(422, "Obiectivul nu aparține spațiului.")
    rate, rate_date, source = resolve_fx(
        db,
        space=space,
        currency=currency,
        occurred_on=occurred_on,
        explicit=fx_rate,
        user_id=actor_id,
    )
    now = now_utc()
    tx = Transaction(
        space_id=space.id,
        account_id=account.id,
        counter_account_id=counter_account.id if counter_account else None,
        category_id=category.id if category else None,
        goal_id=goal.id if goal else None,
        recurring_rule_id=recurring_rule_id,
        kind=kind,
        amount=q4(amount),
        currency=currency,
        counter_amount=counter_amount,
        counter_currency=counter_currency,
        fx_rate=rate,
        fx_rate_date=rate_date,
        fx_source=source,
        occurred_on=occurred_on,
        description=description or "",
        origin=origin,
        import_fingerprint=import_fingerprint,
        created_by=actor_id,
        created_at=now,
        updated_at=now,
    )
    db.add(tx)
    db.flush()
    return tx


def update_transaction(db: Session, *, space: Space, tx: Transaction, actor_id: uuid.UUID, data: dict) -> Transaction:
    if tx.deleted_at is not None or tx.space_id != space.id:
        raise AppError(404, "Tranzacția nu există.")
    if tx.kind in {"debt", "repayment"}:
        raise AppError(422, "Datoria se modifică din pagina Datorii.")
    if data.get("kind") is not None and data["kind"] != tx.kind:
        raise AppError(422, "Tipul tranzacției nu se schimbă.")
    account = _load_account(db, space.id, data["account_id"]) if data.get("account_id") else db.get(Account, tx.account_id)
    if account is None or account.space_id != space.id:
        raise AppError(422, "Contul nu aparține spațiului.")
    amount = parse_positive(data["amount"]) if data.get("amount") is not None else q4(tx.amount)
    occurred = data["occurred_on"] if data.get("occurred_on") is not None else tx.occurred_on
    description = tx.description if data.get("description") is None else data["description"]
    goal = _load_goal(db, space.id, data["goal_id"]) if "goal_id" in data else _load_goal(db, space.id, tx.goal_id)
    explicit = parse_rate(data["fx_rate"]) if data.get("fx_rate") is not None else None
    if tx.kind == "transfer":
        counter_id = data.get("counter_account_id") or tx.counter_account_id
        counter = _load_account(db, space.id, counter_id)
        if counter.id == account.id:
            raise AppError(422, "Conturile transferului trebuie să fie diferite.")
        counter_currency = _code(counter.currency)
        if counter_currency == _code(account.currency):
            counter_amount = q4(amount)
        else:
            supplied = data.get("counter_amount")
            counter_amount = parse_positive(supplied) if supplied is not None else tx.counter_amount
            if counter_amount is None or counter_amount <= 0:
                raise AppError(422, "Transferul între monede cere suma din contul destinație.")
            counter_amount = q4(counter_amount)
        tx.counter_account_id = counter.id
        tx.counter_amount = counter_amount
        tx.counter_currency = counter_currency
        tx.category_id = None
    else:
        category_id = data["category_id"] if data.get("category_id") else tx.category_id
        category = _load_category(db, space.id, category_id)
        if category.kind != tx.kind:
            raise AppError(422, "Categoria nu are același tip cu tranzacția.")
        tx.category_id = category.id
        tx.counter_account_id = None
        tx.counter_amount = None
        tx.counter_currency = None
    kept_rate = explicit if explicit is not None else (tx.fx_rate if _code(account.currency) != _code(space.base_currency) else None)
    rate, rate_date, source = resolve_fx(
        db,
        space=space,
        currency=_code(account.currency),
        occurred_on=occurred,
        explicit=kept_rate,
        user_id=actor_id,
    )
    tx.account_id = account.id
    tx.goal_id = goal.id if goal else None
    tx.amount = q4(amount)
    tx.currency = _code(account.currency)
    tx.fx_rate = rate
    tx.fx_rate_date = rate_date
    tx.fx_source = source
    tx.occurred_on = occurred
    tx.description = description or ""
    tx.updated_at = now_utc()
    return tx


def soft_delete(db: Session, *, space: Space, tx: Transaction, user_id: uuid.UUID) -> Transaction:
    if tx.space_id != space.id or tx.deleted_at is not None:
        raise AppError(404, "Tranzacția nu există.")
    if tx.kind in {"debt", "repayment"}:
        raise AppError(422, "Datoria se șterge din pagina Datorii.")
    tx.deleted_at = now_utc()
    tx.updated_at = tx.deleted_at
    audit(
        db,
        action="delete_transaction",
        user_id=user_id,
        space_id=space.id,
        entity_type="transaction",
        entity_id=tx.id,
    )
    return tx


def account_balance(db: Session, account: Account, on: date | None = None) -> Decimal:
    on = on or today_bucharest()
    balance = q4(account.opening_balance)
    rows = db.scalars(
        select(Transaction).where(
            Transaction.deleted_at.is_(None),
            Transaction.occurred_on <= on,
            Transaction.occurred_on >= account.opening_balance_date,
            or_(Transaction.account_id == account.id, Transaction.counter_account_id == account.id),
        )
    ).all()
    for tx in rows:
        if tx.account_id == account.id:
            if tx.kind == "income":
                balance += tx.amount
            elif tx.kind == "expense":
                balance -= tx.amount
            elif tx.kind == "transfer":
                balance -= tx.amount
            elif tx.kind == "debt":
                balance -= tx.amount
            elif tx.kind == "repayment":
                balance += tx.amount
        if tx.kind == "transfer" and tx.counter_account_id == account.id:
            balance += tx.counter_amount if tx.counter_amount is not None else tx.amount
    return q4(balance)


def list_balances(db: Session, space: Space, on: date | None = None) -> list[dict]:
    accounts = db.scalars(
        select(Account).where(Account.space_id == space.id, Account.archived_at.is_(None)).order_by(Account.name)
    ).all()
    return [account_out(account, account_balance(db, account, on)) for account in accounts]


def ensure_generated(db: Session, space: Space) -> None:
    today = today_bucharest()
    rules = db.scalars(
        select(RecurringRule)
        .where(
            RecurringRule.space_id == space.id,
            RecurringRule.paused_at.is_(None),
            RecurringRule.next_run_on <= today,
        )
        .order_by(RecurringRule.id)
        .with_for_update()
    ).all()
    if not rules:
        return
    for rule in rules:
        cursor = rule.next_run_on
        account = db.get(Account, rule.account_id)
        category = db.get(Category, rule.category_id)
        while cursor <= today and (rule.ends_on is None or cursor <= rule.ends_on):
            exists = db.scalar(
                select(Transaction.id).where(
                    Transaction.recurring_rule_id == rule.id,
                    Transaction.occurred_on == cursor,
                    Transaction.deleted_at.is_(None),
                )
            )
            if exists is None and account is not None and category is not None:
                create_transaction(
                    db,
                    space=space,
                    actor_id=rule.created_by,
                    kind=rule.kind,
                    amount=q4(rule.amount),
                    account=account,
                    category=category,
                    counter_account=None,
                    counter_amount=None,
                    occurred_on=cursor,
                    description=rule.description,
                    goal=None,
                    fx_rate=None,
                    origin="app",
                    recurring_rule_id=rule.id,
                )
            cursor = advance_date(cursor, rule.frequency)
        rule.next_run_on = cursor
    db.commit()


def budget_figures(
    db: Session,
    space: Space,
    budget: Budget,
    *,
    start: date | None = None,
    end: date | None = None,
    start_day: int = 1,
) -> tuple[Decimal, Decimal]:
    if start is None or end is None:
        start, end = period_bounds(budget.year, budget.month, start_day)
    query = select(Transaction).where(
        Transaction.space_id == space.id,
        Transaction.kind == "expense",
        Transaction.deleted_at.is_(None),
        Transaction.occurred_on >= start,
        Transaction.occurred_on <= end,
    )
    if budget.category_id is not None:
        query = query.where(Transaction.category_id == budget.category_id)
    consumed = ZERO
    for tx in db.scalars(query).all():
        converted = amount_in_currency(db, tx, space, budget.currency)
        if converted is not None:
            consumed += converted
    consumed = q4(consumed)
    return consumed, q4(budget.limit_amount - consumed)


def goal_figures(db: Session, space: Space, goal: Goal) -> tuple[Decimal, Decimal]:
    rows = db.scalars(
        select(Transaction).where(Transaction.goal_id == goal.id, Transaction.deleted_at.is_(None))
    ).all()
    progress = ZERO
    for tx in rows:
        converted = amount_in_currency(db, tx, space, goal.currency)
        if converted is not None:
            progress += converted
    progress = q4(progress)
    return progress, q4(goal.target_amount - progress)


def find_budget(db: Session, space_id: uuid.UUID, category_id: uuid.UUID | None, year: int, month: int) -> Budget | None:
    query = select(Budget).where(Budget.space_id == space_id, Budget.year == year, Budget.month == month)
    if category_id is None:
        query = query.where(Budget.category_id.is_(None))
    else:
        query = query.where(Budget.category_id == category_id)
    return db.scalar(query)


def upsert_budget(
    db: Session,
    *,
    space: Space,
    category: Category | None,
    year: int,
    month: int,
    limit_amount: Decimal,
    currency: str,
) -> Budget:
    if not 2000 <= year <= 2100 or not 1 <= month <= 12:
        raise AppError(422, "Perioadă invalidă.")
    if category is not None and category.space_id != space.id:
        raise AppError(422, "Categoria nu aparține spațiului.")
    row = find_budget(db, space.id, category.id if category else None, year, month)
    if row is None:
        row = Budget(
            space_id=space.id,
            category_id=category.id if category else None,
            year=year,
            month=month,
            limit_amount=q4(limit_amount),
            currency=currency_code(currency),
            created_at=now_utc(),
        )
        db.add(row)
        db.flush()
    else:
        row.limit_amount = q4(limit_amount)
        row.currency = currency_code(currency)
    return row


def build_report(
    db: Session,
    *,
    spaces: list[Space],
    start: date,
    end: date,
    currency: str | None,
) -> dict:
    mode = "consolidated" if currency else "separate"
    target = currency_code(currency) if currency else None
    totals: dict[str, dict[str, Decimal]] = {}
    categories: dict[tuple, dict] = {}
    missing: list[dict] = []
    names = {
        category.id: category
        for category in db.scalars(select(Category).where(Category.space_id.in_([space.id for space in spaces] or [uuid.uuid4()]))).all()
    } if spaces else {}
    space_by_id = {space.id: space for space in spaces}
    if spaces:
        rows = db.scalars(
            select(Transaction).where(
                Transaction.space_id.in_(list(space_by_id)),
                Transaction.deleted_at.is_(None),
                Transaction.occurred_on >= start,
                Transaction.occurred_on <= end,
                Transaction.kind.in_(("income", "expense")),
            )
        ).all()
    else:
        rows = []
    for tx in rows:
        space = space_by_id[tx.space_id]
        if mode == "separate":
            bucket = _code(tx.currency)
            amount = q4(tx.amount)
        else:
            converted = amount_in_currency(db, tx, space, target or "RON")
            if converted is None:
                missing.append(
                    {
                        "transaction_id": str(tx.id),
                        "amount": fmt_amount(tx.amount),
                        "currency": _code(tx.currency),
                        "occurred_on": tx.occurred_on.isoformat(),
                        "description": tx.description,
                    }
                )
                continue
            bucket = target or "RON"
            amount = converted
        slot = totals.setdefault(bucket, {"income": ZERO, "expense": ZERO})
        slot[tx.kind] += amount
        if tx.category_id is not None:
            key = (str(tx.category_id), tx.kind, bucket)
            current = categories.setdefault(
                key,
                {
                    "category_id": str(tx.category_id),
                    "category_name": names[tx.category_id].name if tx.category_id in names else "",
                    "kind": tx.kind,
                    "currency": bucket,
                    "total": ZERO,
                },
            )
            current["total"] += amount
    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "currency": target,
        "mode": mode,
        "spaces": [str(space.id) for space in spaces],
        "totals": [
            {"currency": code, "income": fmt_amount(values["income"]), "expense": fmt_amount(values["expense"])}
            for code, values in sorted(totals.items())
        ],
        "by_category": [
            {**item, "total": fmt_amount(item["total"])}
            for item in sorted(categories.values(), key=lambda item: (item["kind"], item["category_name"], item["currency"]))
        ],
        "fara_curs": missing,
    }


def delete_space(db: Session, space: Space) -> None:
    sid = space.id
    db.execute(
        text(
            "UPDATE import_rows SET duplicate_of = NULL "
            "WHERE duplicate_of IN (SELECT id FROM transactions WHERE space_id = :sid)"
        ),
        {"sid": sid},
    )
    db.execute(
        text(
            "UPDATE assistant_idempotency SET transaction_id = NULL "
            "WHERE transaction_id IN (SELECT id FROM transactions WHERE space_id = :sid)"
        ),
        {"sid": sid},
    )
    db.execute(delete(Transaction).where(Transaction.space_id == sid))
    db.execute(delete(RecurringRule).where(RecurringRule.space_id == sid))
    db.execute(delete(Budget).where(Budget.space_id == sid))
    db.execute(delete(Goal).where(Goal.space_id == sid))
    db.execute(delete(ImportBatch).where(ImportBatch.space_id == sid))
    db.execute(delete(ReceiptDraft).where(ReceiptDraft.space_id == sid))
    db.execute(delete(Account).where(Account.space_id == sid))
    db.execute(delete(Category).where(Category.space_id == sid))
    db.execute(delete(SpaceInvitation).where(SpaceInvitation.space_id == sid))
    db.execute(delete(SpaceMember).where(SpaceMember.space_id == sid))
    db.execute(update(Space).where(Space.id == sid).values(archived_at=now_utc()))
    db.delete(space)


def active_categories(db: Session, space_id: uuid.UUID, kind: str | None = None) -> list[Category]:
    query = select(Category).where(Category.space_id == space_id, Category.archived_at.is_(None))
    if kind:
        query = query.where(Category.kind == kind)
    return list(db.scalars(query.order_by(Category.kind, Category.name)).all())


def category_payloads(db: Session, space_id: uuid.UUID, include_archived: bool = False) -> list[dict]:
    query = select(Category).where(Category.space_id == space_id)
    if not include_archived:
        query = query.where(Category.archived_at.is_(None))
    return [category_out(row) for row in db.scalars(query.order_by(Category.kind, Category.name)).all()]
