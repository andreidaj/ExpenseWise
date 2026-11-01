from __future__ import annotations

import secrets
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import AssistantGrant, AssistantToken, EmailToken, RefreshToken, User
from app.money import currency_code, now_utc
from app.security import (
    access_ttl,
    check_login_ip,
    check_register_ip,
    clear_login_failures,
    expires_at,
    hash_password,
    make_access_token,
    record_login_failure,
    refresh_ttl,
    sha256_hex,
    verify_password,
)
from app.seed import create_personal_bootstrap
from app.serialize import user_out
from app.services.audit import audit
from app.services.mailer import app_public_url, deliver

NEUTRAL_EMAIL = "Dacă adresa există, mesajul a fost trimis."


def _issue_session(db: Session, user: User) -> dict:
    raw_refresh = secrets.token_urlsafe(48)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=sha256_hex(raw_refresh),
            expires_at=expires_at(refresh_ttl()),
            created_at=now_utc(),
        )
    )
    return {
        "access_token": make_access_token(user.id),
        "refresh_token": raw_refresh,
        "token_type": "bearer",
        "expires_in": int(access_ttl().total_seconds()),
        "user": user_out(user),
    }


def _recent_emails(db: Session, user_id, purpose: str) -> int:
    since = now_utc() - timedelta(hours=1)
    return int(
        db.scalar(
            select(func.count())
            .select_from(EmailToken)
            .where(
                EmailToken.user_id == user_id,
                EmailToken.purpose == purpose,
                EmailToken.created_at >= since,
            )
        )
        or 0
    )


def _store_email_token(db: Session, user: User, purpose: str, hours: int) -> str:
    raw = secrets.token_urlsafe(32)
    db.add(
        EmailToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=sha256_hex(raw),
            expires_at=expires_at(timedelta(hours=hours)),
            created_at=now_utc(),
        )
    )
    return raw


def register(db: Session, *, email: str, password: str, display_name: str, ip: str) -> dict:
    check_register_ip(ip)
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise AppError(409, "Există deja un cont cu această adresă.")
    now = now_utc()
    user = User(
        email=email,
        password_hash=hash_password(password),
        display_name=display_name.strip(),
        report_view="both",
        period_start_day=1,
        base_currency="RON",
        email_verified_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.flush()
    space, _account = create_personal_bootstrap(db, user.id)
    audit(db, action="register", user_id=user.id, space_id=space.id, entity_type="user", entity_id=user.id)
    payload = _issue_session(db, user)
    payload["personal_space_id"] = str(space.id)
    return payload


def verify_email(db: Session, token: str) -> dict:
    row = db.scalar(select(EmailToken).where(EmailToken.token_hash == sha256_hex(token)))
    if row is None or row.purpose != "verify_email" or row.used_at is not None or row.expires_at <= now_utc():
        raise AppError(400, "Tokenul de confirmare este invalid sau expirat.")
    user = db.get(User, row.user_id)
    if user is None:
        raise AppError(400, "Tokenul de confirmare este invalid sau expirat.")
    now = now_utc()
    row.used_at = now
    user.email_verified_at = now
    user.updated_at = now
    audit(db, action="verify_email", user_id=user.id, entity_type="user", entity_id=user.id)
    from app.models import Space

    personal = db.scalar(select(Space).where(Space.owner_id == user.id, Space.kind == "personal"))
    return {"user": user_out(user), "personal_space_id": str(personal.id) if personal else None}


def resend_verification(db: Session, user: User) -> dict:
    if user.email_verified_at is not None:
        return {"detail": NEUTRAL_EMAIL}
    if _recent_emails(db, user.id, "verify_email") >= 3:
        return {"detail": NEUTRAL_EMAIL}
    now = now_utc()
    db.execute(
        update(EmailToken)
        .where(
            EmailToken.user_id == user.id,
            EmailToken.purpose == "verify_email",
            EmailToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    raw = _store_email_token(db, user, "verify_email", 24)
    deliver("verify_email", user.email, f"{app_public_url()}/confirma-email?token={raw}")
    return {"detail": NEUTRAL_EMAIL}


def login(db: Session, *, email: str, password: str, ip: str) -> dict:
    check_login_ip(ip)
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(user.password_hash, password):
        record_login_failure(ip)
        raise AppError(401, "Email sau parolă incorectă.")
    clear_login_failures(ip)
    if user.email_verified_at is None:
        now = now_utc()
        user.email_verified_at = now
        user.updated_at = now
    audit(db, action="login", user_id=user.id, entity_type="user", entity_id=user.id)
    return _issue_session(db, user)


def _refresh_row(db: Session, raw: str) -> RefreshToken:
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == sha256_hex(raw)))
    if row is None or row.revoked_at is not None or row.expires_at <= now_utc():
        raise AppError(401, "Sesiune invalidă.")
    return row


def refresh(db: Session, raw: str) -> dict:
    row = _refresh_row(db, raw)
    row.revoked_at = now_utc()
    user = db.get(User, row.user_id)
    if user is None:
        raise AppError(401, "Sesiune invalidă.")
    return _issue_session(db, user)


def logout(db: Session, raw: str) -> None:
    row = _refresh_row(db, raw)
    row.revoked_at = now_utc()


def forgot_password(db: Session, email: str) -> dict:
    user = db.scalar(select(User).where(User.email == email))
    if user is None or user.email_verified_at is None:
        return {"detail": NEUTRAL_EMAIL}
    if _recent_emails(db, user.id, "reset_password") >= 3:
        return {"detail": NEUTRAL_EMAIL}
    raw = _store_email_token(db, user, "reset_password", 1)
    deliver("reset_password", user.email, f"{app_public_url()}/resetare-parola?token={raw}")
    return {"detail": NEUTRAL_EMAIL}


def reset_password(db: Session, *, token: str, password: str) -> dict:
    row = db.scalar(select(EmailToken).where(EmailToken.token_hash == sha256_hex(token)))
    if row is None or row.purpose != "reset_password" or row.used_at is not None or row.expires_at <= now_utc():
        raise AppError(400, "Tokenul de resetare este invalid sau expirat.")
    user = db.get(User, row.user_id)
    if user is None:
        raise AppError(400, "Tokenul de resetare este invalid sau expirat.")
    now = now_utc()
    row.used_at = now
    user.password_hash = hash_password(password)
    user.updated_at = now
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    grant_ids = list(db.scalars(select(AssistantGrant.id).where(AssistantGrant.user_id == user.id)).all())
    if grant_ids:
        db.execute(
            update(AssistantGrant)
            .where(AssistantGrant.user_id == user.id, AssistantGrant.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        db.execute(
            update(AssistantToken)
            .where(AssistantToken.grant_id.in_(grant_ids), AssistantToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
    audit(db, action="reset_password", user_id=user.id, entity_type="user", entity_id=user.id)
    return {"detail": "Parola a fost schimbată."}


def update_me(db: Session, user: User, data: dict) -> dict:
    if "display_name" in data and data["display_name"] is not None:
        name = data["display_name"].strip()
        if not name:
            raise AppError(422, "Numele nu poate fi gol.")
        user.display_name = name
    if "report_view" in data and data["report_view"] is not None:
        if data["report_view"] not in {"separate", "consolidated", "both"}:
            raise AppError(422, "Afișare invalidă.")
        user.report_view = data["report_view"]
    if "base_currency" in data and data["base_currency"] is not None:
        user.base_currency = currency_code(data["base_currency"])
    if "period_start_day" in data and data["period_start_day"] is not None:
        day = data["period_start_day"]
        if not isinstance(day, int) or not 1 <= day <= 31:
            raise AppError(422, "Ziua de început este între 1 și 31.")
        user.period_start_day = day
    user.updated_at = now_utc()
    return user_out(user)
