from __future__ import annotations

import base64
import hashlib
import re
import secrets
from datetime import datetime
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

BUCHAREST = ZoneInfo("Europe/Bucharest")


def today():
    return datetime.now(BUCHAREST).date()


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def grab(text: str, path: str) -> str:
    match = re.search(rf"{re.escape(path)}\?token=([A-Za-z0-9_\-]+)", text)
    assert match, text
    return match.group(1)


def register(client, email: str, password: str = "parola123", name: str = "Test"):
    return client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "display_name": name},
    )


def verified(client, caplog, email: str, name: str = "Test"):
    caplog.clear()
    response = register(client, email, name=name)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["user"]["email_verified_at"]
    return body


def spaces(client, token: str):
    response = client.get("/api/spaces", headers=auth(token))
    assert response.status_code == 200, response.text
    return response.json()


def personal(client, token: str) -> dict:
    return next(item for item in spaces(client, token) if item["kind"] == "personal")


def categories(client, token: str, space_id: str):
    response = client.get(f"/api/spaces/{space_id}/categories", headers=auth(token))
    assert response.status_code == 200, response.text
    return response.json()


def category_id(rows, name: str, kind: str) -> str:
    return next(row["id"] for row in rows if row["name"] == name and row["kind"] == kind)


def accounts(client, token: str, space_id: str):
    response = client.get(f"/api/spaces/{space_id}/accounts", headers=auth(token))
    assert response.status_code == 200, response.text
    return response.json()


def invite(client, caplog, owner_token: str, space_id: str, email: str, role: str) -> str:
    caplog.clear()
    response = client.post(
        f"/api/spaces/{space_id}/invitations",
        headers=auth(owner_token),
        json={"email": email, "role": role},
    )
    assert response.status_code == 201, response.text
    return grab(caplog.text, "/invitatie")


def accept(client, token: str, raw: str):
    response = client.post("/api/invitations/accept", headers=auth(token), json={"token": raw})
    assert response.status_code == 200, response.text
    return response.json()


def pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def mcp_call(client, token: str, name: str, arguments: dict, request_id: int = 1):
    return client.post(
        "/mcp",
        headers={
            **auth(token),
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
        },
        json={"jsonrpc": "2.0", "id": request_id, "method": "tools/call", "params": {"name": name, "arguments": arguments}},
    )


def mcp_result(response):
    assert response.status_code == 200, response.text
    body = response.json()
    result = body["result"]
    text = result["content"][0]["text"]
    return result["isError"], text


def oauth_tokens(client, app_access: str, redirect: str = "http://127.0.0.1:9/callback"):
    verifier, challenge = pkce_pair()
    registered = client.post(
        "/oauth/register",
        json={
            "redirect_uris": [redirect],
            "client_name": "Test Client",
            "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
        },
    )
    assert registered.status_code == 201, registered.text
    client_id = registered.json()["client_id"]
    started = client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": "st",
            "scope": "expensewise",
            "resource": "http://localhost:3000/mcp",
        },
        follow_redirects=False,
    )
    assert started.status_code == 302, started.text
    request_id = parse_qs(urlparse(started.headers["location"]).query)["request"][0]
    allowed = client.post(
        f"/api/asistent/autorizare/{request_id}",
        headers=auth(app_access),
        json={"allow": True},
    )
    assert allowed.status_code == 200, allowed.text
    code = parse_qs(urlparse(allowed.json()["redirect_url"]).query)["code"][0]
    exchanged = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect,
            "client_id": client_id,
            "code_verifier": verifier,
        },
    )
    assert exchanged.status_code == 200, exchanged.text
    body = exchanged.json()
    body["client_id"] = client_id
    body["code"] = code
    body["verifier"] = verifier
    body["redirect_uri"] = redirect
    return body
