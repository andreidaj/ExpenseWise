from __future__ import annotations

import base64
import hashlib
import json
import secrets
from datetime import timedelta
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import (
    AssistantAuthCode,
    AssistantAuthRequest,
    AssistantGrant,
    AssistantOAuthClient,
    AssistantToken,
    User,
)
from app.money import now_utc
from app.security import sha256_hex
from app.services.audit import audit

SCOPE = "expensewise"


def resource_url(origin: str) -> str:
    return f"{origin}/mcp"


def _pkce_s256(verifier: str, challenge: str) -> bool:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    computed = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return computed == challenge


def _redirect(url: str, **params: str | None) -> str:
    parsed = urlparse(url)
    query = [(key, value) for key, values in parse_qs(parsed.query).items() for value in values]
    for key, value in params.items():
        if value is not None:
            query.append((key, value))
    return urlunparse(parsed._replace(query=urlencode(query)))


def metadata(origin: str) -> dict:
    return {
        "issuer": origin,
        "authorization_endpoint": f"{origin}/oauth/authorize",
        "token_endpoint": f"{origin}/oauth/token",
        "registration_endpoint": f"{origin}/oauth/register",
        "revocation_endpoint": f"{origin}/oauth/revoke",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none", "client_secret_post", "client_secret_basic"],
        "revocation_endpoint_auth_methods_supported": ["none", "client_secret_post", "client_secret_basic"],
        "scopes_supported": [SCOPE],
    }


def protected_metadata(origin: str) -> dict:
    return {
        "resource": resource_url(origin),
        "authorization_servers": [origin],
        "scopes_supported": [SCOPE],
        "bearer_methods_supported": ["header"],
    }


def register_client(db: Session, body: dict) -> dict:
    redirects = body.get("redirect_uris") or []
    if not redirects:
        raise AppError(400, "redirect_uris este obligatoriu.")
    client_id = secrets.token_urlsafe(24)
    info = {
        "client_id": client_id,
        "client_name": body.get("client_name") or "ExpenseWise",
        "redirect_uris": redirects,
        "grant_types": body.get("grant_types") or ["authorization_code", "refresh_token"],
        "response_types": body.get("response_types") or ["code"],
        "token_endpoint_auth_method": body.get("token_endpoint_auth_method") or "none",
        "scope": SCOPE,
    }
    db.add(
        AssistantOAuthClient(
            client_id=client_id,
            client_info=json.dumps(info, ensure_ascii=False),
            created_at=now_utc(),
        )
    )
    return info


def _client(db: Session, client_id: str) -> dict:
    row = db.get(AssistantOAuthClient, client_id)
    if row is None:
        raise AppError(400, "Client necunoscut.")
    return json.loads(row.client_info)


def begin_authorization(db: Session, origin: str, params: dict) -> str:
    if params.get("response_type") != "code":
        raise AppError(400, "response_type trebuie să fie code.")
    client = _client(db, params.get("client_id") or "")
    redirect_uri = params.get("redirect_uri") or ""
    if redirect_uri not in client["redirect_uris"]:
        raise AppError(400, "redirect_uri nu este înregistrat.")
    if params.get("code_challenge_method") != "S256" or not params.get("code_challenge"):
        raise AppError(400, "PKCE S256 este obligatoriu.")
    resource = params.get("resource")
    if resource and resource.rstrip("/") != resource_url(origin):
        raise AppError(400, "Resursa nu este acceptată.")
    scope = params.get("scope") or SCOPE
    if scope not in {SCOPE, ""} and SCOPE not in scope.split():
        raise AppError(400, "Scope invalid.")
    request_id = secrets.token_urlsafe(32)
    stored = {
        "client_id": client["client_id"],
        "redirect_uri": redirect_uri,
        "code_challenge": params["code_challenge"],
        "state": params.get("state"),
        "scope": SCOPE,
        "resource": resource_url(origin),
        "client_name": client.get("client_name"),
    }
    db.add(
        AssistantAuthRequest(
            id=request_id,
            client_id=client["client_id"],
            params=json.dumps(stored, ensure_ascii=False),
            expires_at=now_utc() + timedelta(minutes=15),
            created_at=now_utc(),
        )
    )
    return f"{origin}/autorizare-asistent?request={request_id}"


def authorization_details(db: Session, request_id: str, user: User) -> dict:
    row = _live_request(db, request_id)
    params = json.loads(row.params)
    return {"request_id": request_id, "client_name": params.get("client_name"), "email": user.email}


def decide(db: Session, *, request_id: str, user: User, allow: bool) -> dict:
    row = _live_request(db, request_id)
    params = json.loads(row.params)
    state = params.get("state")
    if not allow:
        db.delete(row)
        return {"redirect_url": _redirect(params["redirect_uri"], error="access_denied", state=state)}
    grant = AssistantGrant(
        user_id=user.id,
        client_id=params["client_id"],
        client_name=params.get("client_name"),
        created_at=now_utc(),
    )
    db.add(grant)
    db.flush()
    raw_code = secrets.token_urlsafe(32)
    db.add(
        AssistantAuthCode(
            code_hash=sha256_hex(raw_code),
            grant_id=grant.id,
            client_id=params["client_id"],
            code_challenge=params["code_challenge"],
            redirect_uri=params["redirect_uri"],
            redirect_uri_provided_explicitly=True,
            resource=params.get("resource"),
            scopes=SCOPE,
            expires_at=now_utc() + timedelta(minutes=10),
        )
    )
    db.delete(row)
    audit(db, action="mcp_grant", user_id=user.id, entity_type="assistant_grant", entity_id=grant.id)
    return {"redirect_url": _redirect(params["redirect_uri"], code=raw_code, state=state)}


def _live_request(db: Session, request_id: str) -> AssistantAuthRequest:
    row = db.get(AssistantAuthRequest, request_id)
    if row is None or row.expires_at <= now_utc():
        if row is not None:
            db.delete(row)
        raise AppError(410, "Cererea de autorizare a expirat.")
    return row


def _issue_pair(db: Session, grant: AssistantGrant, scopes: str, resource: str | None) -> dict:
    access = secrets.token_urlsafe(32)
    refresh = secrets.token_urlsafe(48)
    now = now_utc()
    db.add(
        AssistantToken(
            token_hash=sha256_hex(access),
            kind="access",
            grant_id=grant.id,
            client_id=grant.client_id,
            scopes=scopes,
            resource=resource,
            expires_at=now + timedelta(hours=1),
            created_at=now,
        )
    )
    db.add(
        AssistantToken(
            token_hash=sha256_hex(refresh),
            kind="refresh",
            grant_id=grant.id,
            client_id=grant.client_id,
            scopes=scopes,
            resource=resource,
            expires_at=now + timedelta(days=30),
            created_at=now,
        )
    )
    return {
        "access_token": access,
        "token_type": "Bearer",
        "expires_in": 3600,
        "refresh_token": refresh,
        "scope": scopes or SCOPE,
    }


def exchange_code(db: Session, form: dict) -> dict:
    code = form.get("code") or ""
    row = db.get(AssistantAuthCode, sha256_hex(code))
    if row is None or row.used_at is not None or row.expires_at <= now_utc():
        raise AppError(400, "invalid_grant")
    if form.get("client_id") != row.client_id or form.get("redirect_uri") != row.redirect_uri:
        raise AppError(400, "invalid_grant")
    if not _pkce_s256(form.get("code_verifier") or "", row.code_challenge):
        raise AppError(400, "invalid_grant")
    grant = db.get(AssistantGrant, row.grant_id)
    if grant is None or grant.revoked_at is not None:
        raise AppError(400, "invalid_grant")
    row.used_at = now_utc()
    return _issue_pair(db, grant, row.scopes, row.resource)


def exchange_refresh(db: Session, form: dict) -> dict:
    raw = form.get("refresh_token") or ""
    row = db.scalar(
        select(AssistantToken).where(AssistantToken.token_hash == sha256_hex(raw), AssistantToken.kind == "refresh")
    )
    if row is None or row.revoked_at is not None or row.expires_at <= now_utc():
        raise AppError(400, "invalid_grant")
    if form.get("client_id") and form["client_id"] != row.client_id:
        raise AppError(400, "invalid_grant")
    grant = db.get(AssistantGrant, row.grant_id)
    if grant is None or grant.revoked_at is not None:
        raise AppError(400, "invalid_grant")
    row.revoked_at = now_utc()
    return _issue_pair(db, grant, row.scopes, row.resource)


def revoke_token(db: Session, raw: str) -> None:
    if not raw:
        return
    row = db.scalar(select(AssistantToken).where(AssistantToken.token_hash == sha256_hex(raw)))
    if row is not None and row.revoked_at is None:
        row.revoked_at = now_utc()


def list_grants(db: Session, user_id: UUID) -> list[dict]:
    rows = db.scalars(
        select(AssistantGrant)
        .where(AssistantGrant.user_id == user_id, AssistantGrant.revoked_at.is_(None))
        .order_by(AssistantGrant.created_at)
    ).all()
    return [
        {
            "id": str(row.id),
            "client_id": row.client_id,
            "client_name": row.client_name,
            "created_at": row.created_at.isoformat(),
            "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
        }
        for row in rows
    ]


def revoke_grant(db: Session, *, user_id: UUID, grant_id: UUID) -> None:
    grant = db.get(AssistantGrant, grant_id)
    if grant is None or grant.user_id != user_id:
        raise AppError(404, "Conexiunea nu există.")
    now = now_utc()
    if grant.revoked_at is None:
        grant.revoked_at = now
    db.execute(
        update(AssistantToken)
        .where(AssistantToken.grant_id == grant.id, AssistantToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    audit(db, action="mcp_revoke", user_id=user_id, entity_type="assistant_grant", entity_id=grant.id)
