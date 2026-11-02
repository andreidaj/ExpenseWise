from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Account, Debt, DebtRepayment, Space, Transaction, User
from app.money import fmt_amount, now_utc, parse_positive, q4
from app.services.audit import audit


def list_debts(db: Session, space: Space) -> list[dict]:
    rows = db.scalars(select(Debt).where(Debt.space_id == space.id).order_by(Debt.occurred_on, Debt.created_at)).all()
    return [debt_out(db, row) for row in rows if _remaining(db, row) > 0]


def create_debt(
    db: Session,
    *,
    space: Space,
    user: User,
    person_name: str,
    amount: str,
    account: Account,
    occurred_on: date,
    note: str,
) -> dict:
    person = _person(person_name)
    value = parse_positive(amount)
    _account(space, account, occurred_on)
    tx = _movement(
        db,
        space=space,
        user=user,
        account=account,
        kind="debt",
        amount=value,
        occurred_on=occurred_on,
        description=person,
    )
    debt = Debt(
        space_id=space.id,
        person_name=person,
        account_id=account.id,
        transaction_id=tx.id,
        amount=value,
        currency=account.currency,
        occurred_on=occurred_on,
        note=(note or "").strip(),
        created_by=user.id,
        created_at=now_utc(),
    )
    db.add(debt)
    db.flush()
    audit(db, action="create_debt", user_id=user.id, space_id=space.id, entity_type="debt", entity_id=debt.id)
    return debt_out(db, debt)


def repay_debt(
    db: Session,
    *,
    space: Space,
    user: User,
    debt: Debt,
    amount: str,
    account: Account,
    occurred_on: date,
) -> dict:
    if debt.space_id != space.id:
        raise AppError(404, "Datoria nu există.")
    value = parse_positive(amount)
    _account(space, account, occurred_on)
    if account.currency.strip() != debt.currency.strip():
        raise AppError(422, "Înapoierea trebuie să fie în moneda datoriei.")
    left = _remaining(db, debt)
    if value > left:
        raise AppError(422, "Suma este mai mare decât ce a rămas de primit.")
    tx = _movement(
        db,
        space=space,
        user=user,
        account=account,
        kind="repayment",
        amount=value,
        occurred_on=occurred_on,
        description=f"{debt.person_name} a dat înapoi",
    )
    repayment = DebtRepayment(
        debt_id=debt.id,
        account_id=account.id,
        transaction_id=tx.id,
        amount=value,
        occurred_on=occurred_on,
        created_at=now_utc(),
    )
    db.add(repayment)
    if q4(left - value) == 0:
        debt.closed_at = now_utc()
    db.flush()
    audit(db, action="repay_debt", user_id=user.id, space_id=space.id, entity_type="debt", entity_id=debt.id)
    return debt_out(db, debt)


def delete_debt(db: Session, *, space: Space, user: User, debt: Debt) -> None:
    if debt.space_id != space.id:
        raise AppError(404, "Datoria nu există.")
    now = now_utc()
    ids = [debt.transaction_id]
    ids.extend(
        db.scalars(select(DebtRepayment.transaction_id).where(DebtRepayment.debt_id == debt.id)).all()
    )
    for tx_id in ids:
        tx = db.get(Transaction, tx_id)
        if tx is not None and tx.deleted_at is None:
            tx.deleted_at = now
            tx.updated_at = now
    db.delete(debt)
    audit(db, action="delete_debt", user_id=user.id, space_id=space.id, entity_type="debt", entity_id=debt.id)


def debt_out(db: Session, debt: Debt) -> dict:
    paid = _paid(db, debt)
    account = db.get(Account, debt.account_id)
    repayments = db.scalars(
        select(DebtRepayment).where(DebtRepayment.debt_id == debt.id).order_by(DebtRepayment.occurred_on)
    ).all()
    return {
        "id": str(debt.id),
        "person_name": debt.person_name,
        "amount": fmt_amount(debt.amount),
        "remaining": fmt_amount(q4(debt.amount - paid)),
        "currency": debt.currency.strip(),
        "account_id": str(debt.account_id),
        "account_name": account.name if account else "",
        "occurred_on": debt.occurred_on.isoformat(),
        "note": debt.note,
        "closed_at": debt.closed_at.isoformat() if debt.closed_at else None,
        "repayments": [
            {
                "id": str(row.id),
                "amount": fmt_amount(row.amount),
                "account_id": str(row.account_id),
                "occurred_on": row.occurred_on.isoformat(),
            }
            for row in repayments
        ],
    }


def _movement(
    db: Session,
    *,
    space: Space,
    user: User,
    account: Account,
    kind: str,
    amount: Decimal,
    occurred_on: date,
    description: str,
) -> Transaction:
    now = now_utc()
    tx = Transaction(
        space_id=space.id,
        account_id=account.id,
        kind=kind,
        amount=amount,
        currency=account.currency,
        occurred_on=occurred_on,
        description=description,
        origin="app",
        created_by=user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(tx)
    db.flush()
    return tx


def _person(value: str) -> str:
    name = " ".join(value.split())
    if not name:
        raise AppError(422, "Scrie numele persoanei.")
    if len(name) > 80:
        raise AppError(422, "Numele este prea lung.")
    return name


def _account(space: Space, account: Account, occurred_on: date) -> None:
    if account.space_id != space.id or account.archived_at is not None:
        raise AppError(422, "Contul nu aparține spațiului.")
    if occurred_on < account.opening_balance_date:
        raise AppError(422, "Data este înainte de deschiderea contului.")


def _paid(db: Session, debt: Debt) -> Decimal:
    rows = db.scalars(select(DebtRepayment.amount).where(DebtRepayment.debt_id == debt.id)).all()
    return q4(sum(rows, Decimal("0")))


def _remaining(db: Session, debt: Debt) -> Decimal:
    return q4(debt.amount - _paid(db, debt))
