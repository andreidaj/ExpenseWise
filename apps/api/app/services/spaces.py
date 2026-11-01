from __future__ import annotations

import secrets
import uuid
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Account, Category, Space, SpaceInvitation, SpaceMember, Transaction, User
from app.money import currency_code, now_utc, parse_amount
from app.security import expires_at, sha256_hex
from app.seed import create_space
from app.services.audit import audit
from app.services.mailer import app_public_url, deliver

INVITE_ROLES = {"admin", "editor", "viewer"}


def open_space(db: Session, user: User, data: dict) -> Space:
    kind = data["kind"]
    if kind not in {"personal", "family", "project"}:
        raise AppError(422, "Tip de spațiu invalid.")
    if data.get("starts_on") and data.get("ends_on") and data["ends_on"] < data["starts_on"]:
        raise AppError(422, "Data de sfârșit este înainte de început.")
    space = create_space(
        db,
        owner_id=user.id,
        name=data["name"],
        kind=kind,
        base_currency=data.get("base_currency") or "RON",
        starts_on=data.get("starts_on"),
        ends_on=data.get("ends_on"),
    )
    audit(db, action="create_space", user_id=user.id, space_id=space.id, entity_type="space", entity_id=space.id)
    return space


def invite(db: Session, *, space: Space, actor: User, email: str, role: str) -> SpaceInvitation:
    if space.kind == "personal":
        raise AppError(403, "Spațiul personal nu acceptă invitații.")
    if role not in INVITE_ROLES:
        raise AppError(422, "Rol de invitație invalid.")
    since = now_utc() - timedelta(hours=1)
    sent = int(
        db.scalar(
            select(func.count())
            .select_from(SpaceInvitation)
            .where(SpaceInvitation.email == email, SpaceInvitation.created_at >= since)
        )
        or 0
    )
    if sent >= 3:
        raise AppError(429, "Prea multe invitații către această adresă. Încearcă mai târziu.")
    raw = secrets.token_urlsafe(32)
    row = SpaceInvitation(
        space_id=space.id,
        email=email,
        role=role,
        token_hash=sha256_hex(raw),
        invited_by=actor.id,
        expires_at=expires_at(timedelta(days=7)),
        created_at=now_utc(),
    )
    db.add(row)
    db.flush()
    deliver("invitation", email, f"{app_public_url()}/invitatie?token={raw}")
    audit(
        db,
        action="invitation",
        user_id=actor.id,
        space_id=space.id,
        entity_type="invitation",
        entity_id=row.id,
        detail={"email": email, "role": role},
    )
    return row


def accept_invitation(db: Session, *, user: User, token: str) -> SpaceMember:
    row = db.scalar(select(SpaceInvitation).where(SpaceInvitation.token_hash == sha256_hex(token)))
    if row is None or row.accepted_at is not None or row.expires_at <= now_utc():
        raise AppError(400, "Invitația este invalidă sau expirată.")
    if user.email.casefold() != row.email.casefold():
        raise AppError(403, "Invitația este pentru altă adresă.")
    existing = db.get(SpaceMember, (row.space_id, user.id))
    if existing is not None:
        raise AppError(409, "Ești deja membru al spațiului.")
    row.accepted_at = now_utc()
    member = SpaceMember(space_id=row.space_id, user_id=user.id, role=row.role, created_at=now_utc())
    db.add(member)
    db.flush()
    return member


def change_role(db: Session, *, space: Space, actor: SpaceMember, target: User, role: str) -> SpaceMember:
    if role not in INVITE_ROLES:
        raise AppError(422, "Rol invalid.")
    member = db.get(SpaceMember, (space.id, target.id))
    if member is None:
        raise AppError(404, "Membrul nu există.")
    if member.role == "owner" or target.id == space.owner_id:
        raise AppError(403, "Proprietarul nu poate fi modificat.")
    member.role = role
    audit(
        db,
        action="change_role",
        user_id=actor.user_id,
        space_id=space.id,
        entity_type="member",
        entity_id=target.id,
        detail={"role": role},
    )
    return member


def remove_member(db: Session, *, space: Space, actor: SpaceMember, target_id: uuid.UUID) -> None:
    member = db.get(SpaceMember, (space.id, target_id))
    if member is None:
        raise AppError(404, "Membrul nu există.")
    if member.role == "owner" or target_id == space.owner_id:
        raise AppError(403, "Proprietarul nu poate fi scos.")
    db.delete(member)
    audit(
        db,
        action="remove_member",
        user_id=actor.user_id,
        space_id=space.id,
        entity_type="member",
        entity_id=target_id,
    )


def create_account(db: Session, space: Space, data: dict) -> Account:
    kind = data["kind"]
    if kind not in {"cash", "bank", "card", "savings"}:
        raise AppError(422, "Tip de cont invalid.")
    account = Account(
        space_id=space.id,
        name=data["name"].strip(),
        kind=kind,
        currency=currency_code(data["currency"]),
        opening_balance=parse_amount(data.get("opening_balance") or "0", allow_zero=True, allow_negative=True),
        opening_balance_date=data["opening_balance_date"],
        created_at=now_utc(),
    )
    if not account.name:
        raise AppError(422, "Numele contului nu poate fi gol.")
    db.add(account)
    db.flush()
    return account


def update_account(db: Session, account: Account, data: dict) -> Account:
    if data.get("currency") and currency_code(data["currency"]) != account.currency.strip():
        raise AppError(409, "Moneda unui cont nu se poate schimba după creare.")
    if data.get("name") is not None:
        name = data["name"].strip()
        if not name:
            raise AppError(422, "Numele contului nu poate fi gol.")
        account.name = name
    if data.get("kind") is not None:
        if data["kind"] not in {"cash", "bank", "card", "savings"}:
            raise AppError(422, "Tip de cont invalid.")
        account.kind = data["kind"]
    if data.get("opening_balance") is not None:
        account.opening_balance = parse_amount(data["opening_balance"], allow_zero=True, allow_negative=True)
    if data.get("opening_balance_date") is not None:
        account.opening_balance_date = data["opening_balance_date"]
    if "archived" in data and data["archived"] is not None:
        account.archived_at = now_utc() if data["archived"] else None
    return account


def delete_account(db: Session, account: Account) -> None:
    used = db.scalar(
        select(func.count())
        .select_from(Transaction)
        .where((Transaction.account_id == account.id) | (Transaction.counter_account_id == account.id))
    )
    if used:
        raise AppError(409, "Contul are tranzacții. Arhivează-l.")
    db.delete(account)


def category_group(value: str) -> str:
    group = value.strip()
    if not group:
        raise AppError(422, "Grupul nu poate fi gol.")
    if len(group) > 40:
        raise AppError(422, "Grupul este prea lung.")
    return group


def create_category(db: Session, space: Space, name: str, kind: str, group_name: str = "Altele") -> Category:
    if kind not in {"income", "expense"}:
        raise AppError(422, "Tip de categorie invalid.")
    clean = name.strip()
    if not clean:
        raise AppError(422, "Numele categoriei nu poate fi gol.")
    group = category_group(group_name)
    exists = db.scalar(
        select(Category).where(Category.space_id == space.id, Category.kind == kind, Category.name == clean)
    )
    if exists is not None:
        raise AppError(409, "Categoria există deja.")
    row = Category(space_id=space.id, name=clean, kind=kind, group_name=group, created_at=now_utc())
    db.add(row)
    db.flush()
    return row


def archive_category(db: Session, category: Category) -> Category:
    category.archived_at = now_utc()
    return category
