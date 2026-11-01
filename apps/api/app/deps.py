from __future__ import annotations

import uuid

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.errors import AppError
from app.models import Space, SpaceMember, User
from app.security import read_access_token

_bearer = HTTPBearer(auto_error=False)
RANK = {"viewer": 1, "editor": 2, "admin": 3, "owner": 4}


def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise AppError(401, "Neautentificat.")
    user_id = read_access_token(credentials.credentials)
    user = db.get(User, user_id)
    if user is None:
        raise AppError(401, "Neautentificat.")
    return user


def get_verified_user(user: User = Depends(get_current_user)) -> User:
    return user


def role_at_least(role: str, minimum: str) -> bool:
    return RANK[role] >= RANK[minimum]


def require_role(member: SpaceMember, minimum: str) -> None:
    if not role_at_least(member.role, minimum):
        raise AppError(403, "Nu ai permisiunea pentru această acțiune.")


def membership(db: Session, space_id: uuid.UUID, user: User) -> tuple[Space, SpaceMember]:
    space = db.get(Space, space_id)
    member = db.get(SpaceMember, (space_id, user.id))
    if space is None or member is None:
        raise AppError(404, "Spațiul nu există.")
    return space, member


def visible_space_ids(db: Session, user_id: uuid.UUID) -> list[uuid.UUID]:
    rows = db.scalars(select(SpaceMember.space_id).where(SpaceMember.user_id == user_id)).all()
    return list(rows)
