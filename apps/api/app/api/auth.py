from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from starlette.responses import Response

from app.deps import get_current_user, get_db
from app.errors import AppError
from app.models import User
from app.security import client_ip
from app.serialize import user_out
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenIn(BaseModel):
    token: str


class EmailIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=8)


class MeIn(BaseModel):
    display_name: str | None = None
    report_view: str | None = None
    base_currency: str | None = None
    period_start_day: int | None = Field(default=None, ge=1, le=31)


def _ip(request: Request) -> str:
    peer = request.client.host if request.client else None
    return client_ip(peer, request.headers.get("x-forwarded-for"))


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    return auth_service.register(
        db,
        email=str(body.email),
        password=body.password,
        display_name=body.display_name,
        ip=_ip(request),
    )


@router.post("/verify-email")
def verify_email(body: TokenIn, db: Session = Depends(get_db)):
    return auth_service.verify_email(db, body.token)


@router.post("/resend-verification")
def resend(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return auth_service.resend_verification(db, user)


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    return auth_service.login(db, email=str(body.email), password=body.password, ip=_ip(request))


def _bearer(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise AppError(401, "Sesiune invalidă.")
    return header.split(" ", 1)[1].strip()


@router.post("/refresh")
def refresh(request: Request, db: Session = Depends(get_db)):
    return auth_service.refresh(db, _bearer(request))


@router.post("/logout", status_code=204)
def logout(request: Request, db: Session = Depends(get_db)):
    auth_service.logout(db, _bearer(request))
    return Response(status_code=204)


@router.post("/forgot-password")
def forgot(body: EmailIn, db: Session = Depends(get_db)):
    return auth_service.forgot_password(db, str(body.email))


@router.post("/reset-password")
def reset(body: ResetIn, db: Session = Depends(get_db)):
    return auth_service.reset_password(db, token=body.token, password=body.password)


me = APIRouter(tags=["me"])


@me.get("/me")
def read_me(user: User = Depends(get_current_user)):
    return user_out(user)


@me.patch("/me")
def patch_me(body: MeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return auth_service.update_me(db, user, body.model_dump(exclude_unset=True))
