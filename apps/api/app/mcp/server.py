"""Asistentul ExpenseWise: OAuth, well-known și transport MCP."""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, RedirectResponse
from mcp.server.auth.middleware.auth_context import AuthContextMiddleware
from mcp.server.auth.middleware.bearer_auth import BearerAuthBackend, RequireAuthMiddleware
from mcp.server.auth.provider import AccessToken
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import StreamableHTTPASGIApp
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.middleware.authentication import AuthenticationMiddleware
from starlette.responses import Response
from starlette.routing import Route

from app.database import SessionLocal
from app.deps import get_db, get_verified_user
from app.errors import AppError
from app.mcp import assistant_public_url
from app.mcp.tools import INSTRUCTIONS, register_tools
from app.models import AssistantGrant, AssistantToken, User
from app.money import now_utc
from app.security import sha256_hex
from app.services import assistant_oauth_service as oauth

router = APIRouter(tags=["asistent"])


class AssistantTokenVerifier:
    async def verify_token(self, token: str) -> AccessToken | None:
        origin = assistant_public_url()
        expected = f"{origin}/mcp"
        db = SessionLocal()
        try:
            row = db.scalar(
                select(AssistantToken).where(
                    AssistantToken.token_hash == sha256_hex(token),
                    AssistantToken.kind == "access",
                )
            )
            if row is None or row.revoked_at is not None or row.expires_at <= now_utc():
                return None
            grant = db.get(AssistantGrant, row.grant_id)
            if grant is None or grant.revoked_at is not None:
                return None
            if row.resource and row.resource.rstrip("/") != expected:
                return None
            now = now_utc()
            if grant.last_used_at is None or (now - grant.last_used_at).total_seconds() >= 60:
                grant.last_used_at = now
                db.commit()
            from app.mcp.tools import assistant_actor

            assistant_actor.set({"user_id": str(grant.user_id), "grant_id": str(grant.id)})
            return AccessToken(
                token=token,
                client_id=row.client_id,
                scopes=[part for part in (row.scopes or SCOPE_FALLBACK).split() if part] or ["expensewise"],
                expires_at=int(row.expires_at.timestamp()),
                resource=row.resource or expected,
                subject=str(grant.user_id),
                claims={"grant_id": str(grant.id)},
            )
        except Exception:
            db.rollback()
            return None
        finally:
            db.close()


SCOPE_FALLBACK = "expensewise"


def _security(origin: str) -> TransportSecuritySettings:
    host = (urlparse(origin).hostname or "").lower()
    if host in {"localhost", "127.0.0.1", "::1"}:
        return TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=["127.0.0.1:*", "localhost:*", "[::1]:*", "localhost", "127.0.0.1", "[::1]"],
            allowed_origins=["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*"],
        )
    return TransportSecuritySettings(enable_dns_rebinding_protection=False)


class _Gate:
    def __init__(self, manager: StreamableHTTPSessionManager, inner) -> None:
        self.manager = manager
        self.inner = inner

    async def __call__(self, scope, receive, send) -> None:
        if getattr(self.manager, "_task_group", None) is None:
            response = JSONResponse({"detail": "Asistentul AI nu este pornit."}, status_code=503)
            await response(scope, receive, send)
            return
        try:
            await self.inner(scope, receive, send)
        except RuntimeError as exc:
            if "Task group" in str(exc):
                response = JSONResponse({"detail": "Asistentul AI nu este pornit."}, status_code=503)
                await response(scope, receive, send)
                return
            raise


def build(origin: str) -> tuple[FastMCP, StreamableHTTPSessionManager, AuthenticationMiddleware]:
    local = (urlparse(origin).hostname or "") in {"localhost", "127.0.0.1", "::1"}
    security = _security(origin)
    fastmcp = FastMCP(
        name="ExpenseWise",
        instructions=INSTRUCTIONS,
        website_url=origin,
        host="localhost" if local else "0.0.0.0",
        json_response=True,
        stateless_http=True,
        transport_security=security,
    )
    register_tools(fastmcp)
    manager = StreamableHTTPSessionManager(
        app=fastmcp._mcp_server,
        json_response=True,
        stateless=True,
        security_settings=security,
    )
    metadata = f"{origin}/.well-known/oauth-protected-resource/mcp"
    inner = RequireAuthMiddleware(StreamableHTTPASGIApp(manager), [], metadata)
    return fastmcp, manager, _Gate(manager, inner)


def _params(request: Request) -> dict[str, str]:
    data = {key: value for key, value in request.query_params.items()}
    return data


def mount_http(app, origin: str) -> None:
    no_store = {"Cache-Control": "no-store"}

    @app.api_route("/.well-known/oauth-authorization-server", methods=["GET", "OPTIONS"])
    @app.api_route("/.well-known/oauth-authorization-server/oauth", methods=["GET", "OPTIONS"])
    @app.api_route("/oauth/.well-known/oauth-authorization-server", methods=["GET", "OPTIONS"])
    def authorization_metadata(request: Request):
        if request.method == "OPTIONS":
            return Response(status_code=204, headers=no_store)
        return JSONResponse(oauth.metadata(origin), headers=no_store)

    @app.api_route("/.well-known/oauth-protected-resource/mcp", methods=["GET", "OPTIONS"])
    @app.api_route("/.well-known/oauth-protected-resource", methods=["GET", "OPTIONS"])
    def resource_metadata(request: Request):
        if request.method == "OPTIONS":
            return Response(status_code=204, headers=no_store)
        return JSONResponse(oauth.protected_metadata(origin), headers=no_store)

    @app.api_route("/oauth/register", methods=["POST", "OPTIONS"])
    async def register(request: Request, db: Session = Depends(get_db)):
        if request.method == "OPTIONS":
            return Response(status_code=204, headers=no_store)

        body = await request.json()
        info = oauth.register_client(db, body)
        return JSONResponse(info, status_code=201)

    @app.api_route("/oauth/authorize", methods=["GET", "POST"])
    async def authorize(request: Request, db: Session = Depends(get_db)):
        params = dict(request.query_params)
        if request.method == "POST":
            form = await request.form()
            params.update({key: str(value) for key, value in form.items()})
        location = oauth.begin_authorization(db, origin, params)
        return RedirectResponse(location, status_code=302)

    @app.api_route("/oauth/token", methods=["POST", "OPTIONS"])
    async def token(request: Request, db: Session = Depends(get_db)):
        if request.method == "OPTIONS":
            return Response(status_code=204, headers=no_store)
        form = await request.form()
        payload = {key: str(value) for key, value in form.items()}
        try:
            if payload.get("grant_type") == "authorization_code":
                body = oauth.exchange_code(db, payload)
            elif payload.get("grant_type") == "refresh_token":
                body = oauth.exchange_refresh(db, payload)
            else:
                return JSONResponse({"error": "unsupported_grant_type"}, status_code=400)
        except AppError as exc:
            return JSONResponse(
                {"error": "invalid_grant", "error_description": exc.detail},
                status_code=400,
            )
        return JSONResponse(body)

    @app.api_route("/oauth/revoke", methods=["POST", "OPTIONS"])
    async def revoke(request: Request, db: Session = Depends(get_db)):
        if request.method == "OPTIONS":
            return Response(status_code=204, headers=no_store)
        form = await request.form()
        oauth.revoke_token(db, str(form.get("token") or ""))
        return Response(status_code=200)


@router.get("/asistent/autorizare/{request_id}")
def read_authorization(request_id: str, user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    return oauth.authorization_details(db, request_id, user)


@router.post("/asistent/autorizare/{request_id}")
async def write_authorization(
    request_id: str,
    request: Request,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    body = await request.json()
    return oauth.decide(db, request_id=request_id, user=user, allow=bool(body.get("allow")))


@router.get("/asistent/conexiuni")
def connections(user: User = Depends(get_verified_user), db: Session = Depends(get_db)):
    return oauth.list_grants(db, user.id)


@router.delete("/asistent/conexiuni/{grant_id}", status_code=204)
def disconnect(
    grant_id: str,
    user: User = Depends(get_verified_user),
    db: Session = Depends(get_db),
):
    from uuid import UUID

    oauth.revoke_grant(db, user_id=user.id, grant_id=UUID(grant_id))
    return Response(status_code=204)


def attach(app, origin: str) -> StreamableHTTPSessionManager:
    _fastmcp, manager, endpoint = build(origin)
    app.router.routes.append(Route("/mcp", endpoint, methods=["GET", "POST", "DELETE"]))
    mount_http(app, origin)
    app.add_middleware(AuthContextMiddleware)
    app.add_middleware(AuthenticationMiddleware, backend=BearerAuthBackend(AssistantTokenVerifier()))
    return manager
