from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.responses import Response

from app.deps import get_db, get_verified_user, membership, require_role, visible_space_ids
from app.errors import AppError
from app.models import (
    Account,
    Budget,
    Category,
    Goal,
    RecurringRule,
    Space,
    Transaction,
    User,
)
from app.money import currency_code, now_utc, parse_amount, parse_positive, parse_rate, today_bucharest
from app.serialize import budget_out, goal_out, transaction_out
from app.services.ledger import (
    account_balance,
    budget_figures,
    build_report,
    create_transaction,
    ensure_generated,
    find_budget,
    goal_figures,
    list_balances,
    set_manual_rate,
    soft_delete,
    update_transaction,
    upsert_budget,
)

router = APIRouter(tags=["money"])


class TxIn(BaseModel):
    kind: str
    amount: str
    account_id: uuid.UUID
    category_id: uuid.UUID | None = None
    counter_account_id: uuid.UUID | None = None
    counter_amount: str | None = None
    occurred_on: date
    description: str = ""
    goal_id: uuid.UUID | None = None
    fx_rate: str | None = None


class TxPatch(BaseModel):
    amount: str | None = None
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    counter_account_id: uuid.UUID | None = None
    counter_amount: str | None = None
    occurred_on: date | None = None
    description: str | None = None
    goal_id: uuid.UUID | None = None
    fx_rate: str | None = None
    kind: str | None = None


class RuleIn(BaseModel):
    kind: str
    amount: str
    account_id: uuid.UUID
    category_id: uuid.UUID
    frequency: str
    next_run_on: date
    description: str = ""
    ends_on: date | None = None


class RulePatch(BaseModel):
    kind: str | None = None
    amount: str | None = None
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    description: str | None = None
    frequency: str | None = None
    next_run_on: date | None = None
    ends_on: date | None = None
    paused: bool | None = None


class BudgetIn(BaseModel):
    category_id: uuid.UUID | None = None
    year: int
    month: int
    limit_amount: str
    currency: str = "RON"


class GoalIn(BaseModel):
    name: str
    target_amount: str
    currency: str = "RON"
    target_date: date | None = None
    account_id: uuid.UUID | None = None


class GoalPatch(BaseModel):
    name: str | None = None
    target_amount: str | None = None
    currency: str | None = None
    target_date: date | None = None
    account_id: uuid.UUID | None = None
    archived: bool | None = None


class RateIn(BaseModel):
    base_currency: str
    quote_currency: str
    rate_date: date
    rate: str


def _account(db: Session, space_id: uuid.UUID, account_id: uuid.UUID) -> Account:
    account = db.get(Account, account_id)
    if account is None or account.space_id != space_id:
        raise AppError(422, "Contul nu aparține spațiului.")
    return account


def _category(db: Session, space_id: uuid.UUID, category_id: uuid.UUID | None) -> Category | None:
    if category_id is None:
        return None
    category = db.get(Category, category_id)
    if category is None or category.space_id != space_id:
        raise AppError(422, "Categoria nu aparține spațiului.")
    return category


def _goal(db: Session, space_id: uuid.UUID, goal_id: uuid.UUID | None) -> Goal | None:
    if goal_id is None:
        return None
    goal = db.get(Goal, goal_id)
    if goal is None or goal.space_id != space_id:
        raise AppError(422, "Obiectivul nu aparține spațiului.")
    return goal


@router.get("/spaces/{space_id}/transactions")
def list_transactions(
    space_id: uuid.UUID,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, _member = membership(db, space_id, user)
    ensure_generated(db, space)
    rows = db.scalars(
        select(Transaction)
        .where(Transaction.space_id == space.id, Transaction.deleted_at.is_(None))
        .order_by(Transaction.occurred_on, Transaction.created_at)
    ).all()
    return [transaction_out(row) for row in rows]


@router.post("/spaces/{space_id}/transactions", status_code=201)
def post_transaction(
    space_id: uuid.UUID,
    body: TxIn,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "editor")
    tx = create_transaction(
        db,
        space=space,
        actor_id=user.id,
        kind=body.kind,
        amount=parse_positive(body.amount),
        account=_account(db, space.id, body.account_id),
        category=_category(db, space.id, body.category_id),
        counter_account=_account(db, space.id, body.counter_account_id) if body.counter_account_id else None,
        counter_amount=parse_positive(body.counter_amount) if body.counter_amount else None,
        occurred_on=body.occurred_on,
        description=body.description,
        goal=_goal(db, space.id, body.goal_id),
        fx_rate=parse_rate(body.fx_rate) if body.fx_rate else None,
        origin="app",
    )
    return transaction_out(tx)


@router.get("/spaces/{space_id}/transactions/{tx_id}")
def get_transaction(
    space_id: uuid.UUID,
    tx_id: uuid.UUID,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, _member = membership(db, space_id, user)
    tx = db.get(Transaction, tx_id)
    if tx is None or tx.space_id != space.id:
        raise AppError(404, "Tranzacția nu există.")
    return transaction_out(tx)


@router.patch("/spaces/{space_id}/transactions/{tx_id}")
def patch_transaction(
    space_id: uuid.UUID,
    tx_id: uuid.UUID,
    body: TxPatch,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "editor")
    tx = db.get(Transaction, tx_id)
    if tx is None or tx.space_id != space.id or tx.deleted_at is not None:
        raise AppError(404, "Tranzacția nu există.")
    update_transaction(db, space=space, tx=tx, actor_id=user.id, data=body.model_dump(exclude_unset=True))
    return transaction_out(tx)


@router.delete("/spaces/{space_id}/transactions/{tx_id}")
def delete_transaction(
    space_id: uuid.UUID,
    tx_id: uuid.UUID,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    tx = db.get(Transaction, tx_id)
    if tx is None or tx.space_id != space.id or tx.deleted_at is not None:
        raise AppError(404, "Tranzacția nu există.")
    soft_delete(db, space=space, tx=tx, user_id=user.id)
    return transaction_out(tx)


@router.get("/spaces/{space_id}/balances")
def balances(
    space_id: uuid.UUID,
    on: date | None = None,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, _member = membership(db, space_id, user)
    ensure_generated(db, space)
    return {"accounts": list_balances(db, space, on)}


def _rule_out(rule: RecurringRule) -> dict:
    return {
        "id": str(rule.id),
        "space_id": str(rule.space_id),
        "account_id": str(rule.account_id),
        "category_id": str(rule.category_id),
        "kind": rule.kind,
        "amount": f"{rule.amount:.4f}" if rule.amount is not None else None,
        "currency": rule.currency.strip(),
        "description": rule.description,
        "frequency": rule.frequency,
        "next_run_on": rule.next_run_on.isoformat(),
        "ends_on": rule.ends_on.isoformat() if rule.ends_on else None,
        "paused_at": rule.paused_at.isoformat() if rule.paused_at else None,
        "created_by": str(rule.created_by),
    }


@router.get("/spaces/{space_id}/recurring-rules")
def list_rules(space_id: uuid.UUID, user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    space, _member = membership(db, space_id, user)
    ensure_generated(db, space)
    rows = db.scalars(select(RecurringRule).where(RecurringRule.space_id == space.id)).all()
    return [_rule_out(row) for row in rows]


@router.post("/spaces/{space_id}/recurring-rules", status_code=201)
def post_rule(
    space_id: uuid.UUID,
    body: RuleIn,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "editor")
    account = _account(db, space.id, body.account_id)
    category = _category(db, space.id, body.category_id)
    if category is None or category.kind != body.kind:
        raise AppError(422, "Categoria nu are același tip cu regula.")
    if body.frequency not in {"weekly", "monthly", "yearly"} or body.kind not in {"income", "expense"}:
        raise AppError(422, "Regulă invalidă.")
    rule = RecurringRule(
        space_id=space.id,
        account_id=account.id,
        category_id=category.id,
        kind=body.kind,
        amount=parse_positive(body.amount),
        currency=account.currency.strip(),
        description=body.description,
        frequency=body.frequency,
        next_run_on=body.next_run_on,
        ends_on=body.ends_on,
        created_by=user.id,
        created_at=now_utc(),
    )
    db.add(rule)
    db.flush()
    return _rule_out(rule)


@router.patch("/spaces/{space_id}/recurring-rules/{rule_id}")
def patch_rule(
    space_id: uuid.UUID,
    rule_id: uuid.UUID,
    body: RulePatch,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    rule = db.get(RecurringRule, rule_id)
    if rule is None or rule.space_id != space.id:
        raise AppError(404, "Regula nu există.")
    data = body.model_dump(exclude_unset=True)
    if data.get("kind") is not None:
        if data["kind"] not in {"income", "expense"}:
            raise AppError(422, "Regulă invalidă.")
        rule.kind = data["kind"]
    if data.get("account_id") is not None:
        account = _account(db, space.id, data["account_id"])
        rule.account_id = account.id
        rule.currency = account.currency.strip()
    if data.get("category_id") is not None:
        category = _category(db, space.id, data["category_id"])
        if category is None or category.kind != rule.kind:
            raise AppError(422, "Categoria nu are același tip cu regula.")
        rule.category_id = category.id
    if data.get("amount") is not None:
        rule.amount = parse_positive(data["amount"])
    if data.get("description") is not None:
        rule.description = data["description"]
    if data.get("frequency") is not None:
        if data["frequency"] not in {"weekly", "monthly", "yearly"}:
            raise AppError(422, "Frecvență invalidă.")
        rule.frequency = data["frequency"]
    if data.get("next_run_on") is not None:
        rule.next_run_on = data["next_run_on"]
    if "ends_on" in data:
        rule.ends_on = data["ends_on"]
    if data.get("paused") is True:
        rule.paused_at = now_utc()
    elif data.get("paused") is False:
        rule.paused_at = None
    return _rule_out(rule)


@router.delete("/spaces/{space_id}/recurring-rules/{rule_id}", status_code=204)
def delete_rule(
    space_id: uuid.UUID,
    rule_id: uuid.UUID,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    rule = db.get(RecurringRule, rule_id)
    if rule is None or rule.space_id != space.id:
        raise AppError(404, "Regula nu există.")
    linked = db.scalar(
        select(Transaction.id).where(Transaction.recurring_rule_id == rule.id, Transaction.deleted_at.is_(None))
    )
    if linked is not None:
        raise AppError(409, "Regula are tranzacții generate. O poți opri.")
    db.delete(rule)
    return Response(status_code=204)


@router.get("/spaces/{space_id}/budgets")
def list_budgets(
    space_id: uuid.UUID,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, _member = membership(db, space_id, user)
    if (date_from is None) != (date_to is None):
        raise AppError(422, "Perioada cere ambele date.")
    if date_from is not None and date_to is not None and date_from > date_to:
        raise AppError(422, "Data de început este după data de sfârșit.")
    ensure_generated(db, space)
    rows = db.scalars(select(Budget).where(Budget.space_id == space.id)).all()
    payload = []
    for row in rows:
        if date_from is not None and date_to is not None:
            consumed, remaining = budget_figures(db, space, row, start=date_from, end=date_to)
        else:
            consumed, remaining = budget_figures(db, space, row, start_day=user.period_start_day)
        payload.append(budget_out(row, consumed, remaining))
    return payload


@router.post("/spaces/{space_id}/budgets", status_code=201)
def post_budget(
    space_id: uuid.UUID,
    body: BudgetIn,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    if find_budget(db, space.id, body.category_id, body.year, body.month) is not None:
        raise AppError(409, "Bugetul perioadei există deja.")
    row = upsert_budget(
        db,
        space=space,
        category=_category(db, space.id, body.category_id),
        year=body.year,
        month=body.month,
        limit_amount=parse_amount(body.limit_amount, allow_zero=True),
        currency=body.currency,
    )
    consumed, remaining = budget_figures(db, space, row, start_day=user.period_start_day)
    return budget_out(row, consumed, remaining)


@router.patch("/spaces/{space_id}/budgets/{budget_id}")
def patch_budget(
    space_id: uuid.UUID,
    budget_id: uuid.UUID,
    body: BudgetIn,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    row = db.get(Budget, budget_id)
    if row is None or row.space_id != space.id:
        raise AppError(404, "Bugetul nu există.")
    category = _category(db, space.id, body.category_id)
    other = find_budget(db, space.id, body.category_id, row.year, row.month)
    if other is not None and other.id != row.id:
        raise AppError(409, "Bugetul perioadei există deja.")
    row.category_id = category.id if category else None
    row.limit_amount = parse_amount(body.limit_amount, allow_zero=True)
    row.currency = currency_code(body.currency)
    consumed, remaining = budget_figures(db, space, row, start_day=user.period_start_day)
    return budget_out(row, consumed, remaining)


@router.delete("/spaces/{space_id}/budgets/{budget_id}", status_code=204)
def delete_budget(
    space_id: uuid.UUID,
    budget_id: uuid.UUID,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    row = db.get(Budget, budget_id)
    if row is None or row.space_id != space.id:
        raise AppError(404, "Bugetul nu există.")
    db.delete(row)
    return Response(status_code=204)


@router.get("/spaces/{space_id}/goals")
def list_goals(space_id: uuid.UUID, user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    space, _member = membership(db, space_id, user)
    ensure_generated(db, space)
    rows = db.scalars(select(Goal).where(Goal.space_id == space.id, Goal.archived_at.is_(None))).all()
    payload = []
    for row in rows:
        progress, remaining = goal_figures(db, space, row)
        payload.append(goal_out(row, progress, remaining))
    return payload


@router.post("/spaces/{space_id}/goals", status_code=201)
def post_goal(
    space_id: uuid.UUID,
    body: GoalIn,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    if body.account_id:
        _account(db, space.id, body.account_id)
    row = Goal(
        space_id=space.id,
        name=body.name.strip(),
        target_amount=parse_positive(body.target_amount),
        currency=currency_code(body.currency),
        target_date=body.target_date,
        account_id=body.account_id,
        created_at=now_utc(),
    )
    db.add(row)
    db.flush()
    progress, remaining = goal_figures(db, space, row)
    return goal_out(row, progress, remaining)


@router.get("/spaces/{space_id}/goals/{goal_id}")
def get_goal(
    space_id: uuid.UUID,
    goal_id: uuid.UUID,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, _member = membership(db, space_id, user)
    row = db.get(Goal, goal_id)
    if row is None or row.space_id != space.id:
        raise AppError(404, "Obiectivul nu există.")
    progress, remaining = goal_figures(db, space, row)
    return goal_out(row, progress, remaining)


@router.patch("/spaces/{space_id}/goals/{goal_id}")
def patch_goal(
    space_id: uuid.UUID,
    goal_id: uuid.UUID,
    body: GoalPatch,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    row = db.get(Goal, goal_id)
    if row is None or row.space_id != space.id:
        raise AppError(404, "Obiectivul nu există.")
    data = body.model_dump(exclude_unset=True)
    if data.get("name"):
        row.name = data["name"].strip()
    if data.get("target_amount") is not None:
        row.target_amount = parse_positive(data["target_amount"])
    if data.get("currency") is not None:
        row.currency = currency_code(data["currency"])
    if "target_date" in data:
        row.target_date = data["target_date"]
    if "account_id" in data:
        if data["account_id"] is None:
            row.account_id = None
        else:
            _account(db, space.id, data["account_id"])
            row.account_id = data["account_id"]
    if data.get("archived") is True:
        row.archived_at = now_utc()
    elif data.get("archived") is False:
        row.archived_at = None
    progress, remaining = goal_figures(db, space, row)
    return goal_out(row, progress, remaining)


@router.delete("/spaces/{space_id}/goals/{goal_id}", status_code=204)
def delete_goal(
    space_id: uuid.UUID,
    goal_id: uuid.UUID,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    row = db.get(Goal, goal_id)
    if row is None or row.space_id != space.id:
        raise AppError(404, "Obiectivul nu există.")
    linked = db.scalar(select(Transaction.id).where(Transaction.goal_id == row.id))
    if linked is not None:
        row.archived_at = now_utc()
        return Response(status_code=204)
    db.delete(row)
    return Response(status_code=204)


@router.get("/reports")
def reports(
    db: Session = Depends(get_db),
    user: User = Depends(get_verified_user),
    space_id: list[uuid.UUID] | None = Query(default=None),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    currency: str | None = None,
):
    today = today_bucharest()
    start = date_from or date(today.year, today.month, 1)
    end = date_to or today
    allowed = set(visible_space_ids(db, user.id))
    chosen = allowed if not space_id else {item for item in space_id if item in allowed}
    spaces = list(db.scalars(select(Space).where(Space.id.in_(chosen or {uuid.uuid4()}))).all()) if chosen else []
    spaces = [space for space in spaces if space.id in chosen]
    for space in sorted(spaces, key=lambda item: item.id):
        ensure_generated(db, space)
    return build_report(db, spaces=spaces, start=start, end=end, currency=currency)


@router.get("/export")
def export_data(user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    from app.models import SpaceMember
    from app.serialize import account_out, category_out, space_out

    ids = visible_space_ids(db, user.id)
    spaces = list(db.scalars(select(Space).where(Space.id.in_(ids))).all()) if ids else []
    payload = []
    for space in sorted(spaces, key=lambda item: item.id):
        ensure_generated(db, space)
        member = db.get(SpaceMember, (space.id, user.id))
        accounts = db.scalars(select(Account).where(Account.space_id == space.id)).all()
        categories = db.scalars(select(Category).where(Category.space_id == space.id)).all()
        txs = db.scalars(
            select(Transaction).where(Transaction.space_id == space.id, Transaction.deleted_at.is_(None))
        ).all()
        rules = db.scalars(select(RecurringRule).where(RecurringRule.space_id == space.id)).all()
        budgets = db.scalars(select(Budget).where(Budget.space_id == space.id)).all()
        goals = db.scalars(select(Goal).where(Goal.space_id == space.id)).all()
        payload.append(
            {
                "space": space_out(space, member.role if member else None),
                "accounts": [account_out(row, account_balance(db, row)) for row in accounts],
                "categories": [category_out(row) for row in categories],
                "transactions": [transaction_out(row) for row in txs],
                "recurring_rules": [_rule_out(row) for row in rules],
                "budgets": [
                    budget_out(row, *budget_figures(db, space, row, start_day=user.period_start_day)) for row in budgets
                ],
                "goals": [goal_out(row, *goal_figures(db, space, row)) for row in goals],
            }
        )
    return {"exported_at": now_utc().isoformat(), "spaces": payload}


@router.post("/exchange-rates", status_code=201)
def post_rate(body: RateIn, user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    row = set_manual_rate(
        db,
        user_id=user.id,
        base_currency=body.base_currency,
        quote_currency=body.quote_currency,
        rate_date=body.rate_date,
        rate=parse_rate(body.rate),
    )
    return {
        "id": str(row.id),
        "base_currency": row.base_currency.strip(),
        "quote_currency": row.quote_currency.strip(),
        "rate_date": row.rate_date.isoformat(),
        "rate": f"{row.rate:.8f}",
        "source": row.source,
    }
