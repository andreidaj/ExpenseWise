from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.responses import Response

from app.deps import get_db, get_verified_user, membership, require_role
from app.errors import AppError
from app.models import SpaceMember, User
from app.serialize import account_out, category_out, space_out
from app.services import spaces as space_service
from app.services.ledger import delete_space, ensure_generated

router = APIRouter(tags=["spaces"])


class SpaceIn(BaseModel):
    name: str = Field(min_length=1)
    kind: str
    base_currency: str | None = "RON"
    starts_on: date | None = None
    ends_on: date | None = None


class SpacePatch(BaseModel):
    name: str | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    archived: bool | None = None


class InviteIn(BaseModel):
    email: EmailStr
    role: str


class AcceptIn(BaseModel):
    token: str


class RoleIn(BaseModel):
    role: str


class AccountIn(BaseModel):
    name: str
    kind: str
    currency: str
    opening_balance: str | None = "0"
    opening_balance_date: date


class AccountPatch(BaseModel):
    name: str | None = None
    kind: str | None = None
    currency: str | None = None
    opening_balance: str | None = None
    opening_balance_date: date | None = None
    archived: bool | None = None


class CategoryIn(BaseModel):
    name: str
    kind: str
    group_name: str | None = None


class CategoryPatch(BaseModel):
    name: str | None = None
    archived: bool | None = None
    group_name: str | None = None


@router.get("/spaces")
def list_spaces(user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(space_service.Space, SpaceMember.role)
        .join(SpaceMember, SpaceMember.space_id == space_service.Space.id)
        .where(SpaceMember.user_id == user.id)
        .order_by(space_service.Space.created_at)
    ).all()
    return [space_out(space, role) for space, role in rows]


@router.post("/spaces", status_code=201)
def post_space(body: SpaceIn, user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    space = space_service.open_space(db, user, body.model_dump())
    return space_out(space, "owner")


@router.get("/spaces/{space_id}")
def get_space(space_id: uuid.UUID, user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    space, member = membership(db, space_id, user)
    ensure_generated(db, space)
    return space_out(space, member.role)


@router.patch("/spaces/{space_id}")
def patch_space(
    space_id: uuid.UUID,
    body: SpacePatch,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    data = body.model_dump(exclude_unset=True)
    if data.get("name"):
        space.name = data["name"].strip()
    if "starts_on" in data:
        space.starts_on = data["starts_on"]
    if "ends_on" in data:
        space.ends_on = data["ends_on"]
    if data.get("archived") is True:
        from app.money import now_utc

        space.archived_at = now_utc()
    elif data.get("archived") is False:
        space.archived_at = None
    return space_out(space, member.role)


@router.delete("/spaces/{space_id}", status_code=204)
def remove_space(space_id: uuid.UUID, user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    space, member = membership(db, space_id, user)
    if member.role != "owner":
        raise AppError(403, "Doar proprietarul poate șterge spațiul.")
    delete_space(db, space)
    return Response(status_code=204)


@router.post("/spaces/{space_id}/invitations", status_code=201)
def post_invite(
    space_id: uuid.UUID,
    body: InviteIn,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    row = space_service.invite(db, space=space, actor=user, email=str(body.email), role=body.role)
    return {
        "id": str(row.id),
        "email": row.email,
        "role": row.role,
        "expires_at": row.expires_at.isoformat(),
    }


@router.post("/invitations/accept")
def accept(body: AcceptIn, user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    member = space_service.accept_invitation(db, user=user, token=body.token)
    space = db.get(space_service.Space, member.space_id)
    return {"space_id": str(member.space_id), "role": member.role, "name": space.name if space else None}


@router.patch("/spaces/{space_id}/members/{user_id}")
def patch_member(
    space_id: uuid.UUID,
    user_id: uuid.UUID,
    body: RoleIn,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, actor = membership(db, space_id, user)
    require_role(actor, "admin")
    target = db.get(User, user_id)
    if target is None:
        raise AppError(404, "Membrul nu există.")
    member = space_service.change_role(db, space=space, actor=actor, target=target, role=body.role)
    return {"user_id": str(member.user_id), "role": member.role}


@router.delete("/spaces/{space_id}/members/{user_id}", status_code=204)
def delete_member(
    space_id: uuid.UUID,
    user_id: uuid.UUID,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, actor = membership(db, space_id, user)
    require_role(actor, "admin")
    space_service.remove_member(db, space=space, actor=actor, target_id=user_id)
    return Response(status_code=204)


@router.get("/spaces/{space_id}/accounts")
def list_accounts(space_id: uuid.UUID, user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    space, _member = membership(db, space_id, user)
    from app.models import Account

    rows = db.scalars(
        select(Account).where(Account.space_id == space.id, Account.archived_at.is_(None)).order_by(Account.name)
    ).all()
    return [account_out(row) for row in rows]


@router.post("/spaces/{space_id}/accounts", status_code=201)
def post_account(
    space_id: uuid.UUID,
    body: AccountIn,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    account = space_service.create_account(db, space, body.model_dump())
    return account_out(account)


@router.get("/spaces/{space_id}/accounts/{account_id}")
def get_account(
    space_id: uuid.UUID,
    account_id: uuid.UUID,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, _member = membership(db, space_id, user)
    from app.models import Account

    account = db.get(Account, account_id)
    if account is None or account.space_id != space.id:
        raise AppError(404, "Contul nu există.")
    return account_out(account)


@router.patch("/spaces/{space_id}/accounts/{account_id}")
def patch_account(
    space_id: uuid.UUID,
    account_id: uuid.UUID,
    body: AccountPatch,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    from app.models import Account

    account = db.get(Account, account_id)
    if account is None or account.space_id != space.id:
        raise AppError(404, "Contul nu există.")
    space_service.update_account(db, account, body.model_dump(exclude_unset=True))
    return account_out(account)


@router.delete("/spaces/{space_id}/accounts/{account_id}", status_code=204)
def remove_account(
    space_id: uuid.UUID,
    account_id: uuid.UUID,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    from app.models import Account

    account = db.get(Account, account_id)
    if account is None or account.space_id != space.id:
        raise AppError(404, "Contul nu există.")
    space_service.delete_account(db, account)
    return Response(status_code=204)


@router.get("/spaces/{space_id}/categories")
def list_categories(
    space_id: uuid.UUID,
    include_archived: bool = False,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, _member = membership(db, space_id, user)
    from app.services.ledger import category_payloads

    return category_payloads(db, space.id, include_archived)


@router.post("/spaces/{space_id}/categories", status_code=201)
def post_category(
    space_id: uuid.UUID,
    body: CategoryIn,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    return category_out(space_service.create_category(db, space, body.name, body.kind, body.group_name or "Altele"))


@router.patch("/spaces/{space_id}/categories/{category_id}")
def patch_category(
    space_id: uuid.UUID,
    category_id: uuid.UUID,
    body: CategoryPatch,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    from app.models import Category

    category = db.get(Category, category_id)
    if category is None or category.space_id != space.id:
        raise AppError(404, "Categoria nu există.")
    data = body.model_dump(exclude_unset=True)
    if data.get("name"):
        category.name = data["name"].strip()
    if data.get("group_name"):
        category.group_name = space_service.category_group(data["group_name"])
    if data.get("archived") is True:
        space_service.archive_category(db, category)
    elif data.get("archived") is False:
        category.archived_at = None
    return category_out(category)


@router.delete("/spaces/{space_id}/categories/{category_id}")
def remove_category(
    space_id: uuid.UUID,
    category_id: uuid.UUID,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    space, member = membership(db, space_id, user)
    require_role(member, "admin")
    from app.models import Category

    category = db.get(Category, category_id)
    if category is None or category.space_id != space.id:
        raise AppError(404, "Categoria nu există.")
    space_service.archive_category(db, category)
    return category_out(category)
