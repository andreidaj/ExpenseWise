from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.deps import get_db, get_verified_user, membership, require_role
from app.errors import AppError
from app.models import Account, Debt, User
from app.services.debts import create_debt, delete_debt, list_debts, repay_debt

router = APIRouter(tags=["debts"])


class DebtIn(BaseModel):
    person_name: str
    amount: str
    account_id: uuid.UUID
    occurred_on: date
    note: str = ""


class RepayIn(BaseModel):
    amount: str
    account_id: uuid.UUID
    occurred_on: date


def _account(db: Session, space_id: uuid.UUID, account_id: uuid.UUID) -> Account:
    account = db.get(Account, account_id)
    if account is None or account.space_id != space_id:
        raise AppError(422, "Contul nu aparține spațiului.")
    return account


@router.get("/spaces/{space_id}/debts")
def get_debts(space_id: uuid.UUID, user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    space, _member = membership(db, space_id, user)
    return list_debts(db, space)


@router.post("/spaces/{space_id}/debts", status_code=201)
def post_debt(space_id: uuid.UUID, body: DebtIn, user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    space, member = membership(db, space_id, user)
    require_role(member, "editor")
    account = _account(db, space.id, body.account_id)
    return create_debt(
        db,
        space=space,
        user=user,
        person_name=body.person_name,
        amount=body.amount,
        account=account,
        occurred_on=body.occurred_on,
        note=body.note,
    )


@router.post("/spaces/{space_id}/debts/{debt_id}/repayments", status_code=201)
def post_repayment(
    space_id: uuid.UUID,
    debt_id: uuid.UUID,
    body: RepayIn,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "editor")
    debt = db.get(Debt, debt_id)
    if debt is None or debt.space_id != space.id:
        raise AppError(404, "Datoria nu există.")
    account = _account(db, space.id, body.account_id)
    return repay_debt(
        db,
        space=space,
        user=user,
        debt=debt,
        amount=body.amount,
        account=account,
        occurred_on=body.occurred_on,
    )


@router.delete("/spaces/{space_id}/debts/{debt_id}", status_code=204)
def remove_debt(
    space_id: uuid.UUID,
    debt_id: uuid.UUID,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    debt = db.get(Debt, debt_id)
    if debt is None or debt.space_id != space.id:
        raise AppError(404, "Datoria nu există.")
    delete_debt(db, space=space, user=user, debt=debt)
    return Response(status_code=204)
