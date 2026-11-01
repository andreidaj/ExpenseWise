import json

from fastapi.testclient import TestClient

from tests.helpers import accounts, auth, categories, category_id, mcp_call, oauth_tokens, personal, today, verified


def _data(response):
    assert response.status_code == 200, response.text
    result = response.json()["result"]
    text = result["content"][0]["text"]
    if result["isError"]:
        return True, text
    return False, json.loads(text)


def test_gate_without_public_url(monkeypatch):
    monkeypatch.setenv("ASSISTANT_PUBLIC_URL", "")
    from app.main import create_app

    fresh = create_app()
    with TestClient(fresh) as gated:
        assert gated.get("/mcp").status_code == 404
        assert gated.get("/.well-known/oauth-authorization-server").status_code == 404
        assert gated.get("/api/asistent/conexiuni").status_code == 404


def test_well_known_and_unauthorized(client):
    metadata = client.get("/.well-known/oauth-authorization-server")
    resource = client.get("/.well-known/oauth-protected-resource/mcp")
    assert metadata.status_code == 200
    assert metadata.json()["issuer"] == "http://localhost:3000"
    assert resource.json()["resource"] == "http://localhost:3000/mcp"
    assert metadata.headers["cache-control"] == "no-store"
    denied = client.post(
        "/mcp",
        headers={"Accept": "application/json, text/event-stream", "Content-Type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "spatii_disponibile", "arguments": {}}},
    )
    assert denied.status_code == 401
    assert "resource_metadata" in denied.headers["www-authenticate"]
    assert denied.json()["error"] == "invalid_token"


def test_pkce_rotation_and_disconnect(client, caplog):
    user = verified(client, caplog, "pkce@example.com")
    tokens = oauth_tokens(client, user["access_token"])
    reused = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": tokens["code"],
            "redirect_uri": tokens["redirect_uri"],
            "client_id": tokens["client_id"],
            "code_verifier": tokens["verifier"],
        },
    )
    assert reused.status_code == 400
    assert reused.json()["error"] == "invalid_grant"
    rotated = client.post(
        "/oauth/token",
        data={"grant_type": "refresh_token", "refresh_token": tokens["refresh_token"], "client_id": tokens["client_id"]},
    )
    assert rotated.status_code == 200, rotated.text
    assert rotated.json()["access_token"] != tokens["access_token"]
    old = client.post(
        "/oauth/token",
        data={"grant_type": "refresh_token", "refresh_token": tokens["refresh_token"], "client_id": tokens["client_id"]},
    )
    assert old.status_code == 400
    listed = client.get("/api/asistent/conexiuni", headers=auth(user["access_token"]))
    assert listed.status_code == 200, listed.text
    grant_id = listed.json()[0]["id"]
    assert client.delete(f"/api/asistent/conexiuni/{grant_id}", headers=auth(user["access_token"])).status_code == 204
    denied = mcp_call(client, rotated.json()["access_token"], "spatii_disponibile", {})
    assert denied.status_code == 401


def test_one_space_many_spaces_roles_confirm_and_idempotency(client, caplog):
    owner = verified(client, caplog, "mcp-owner@example.com")
    viewer = verified(client, caplog, "mcp-viewer@example.com")
    editor = verified(client, caplog, "mcp-editor@example.com")
    outsider = verified(client, caplog, "mcp-outsider@example.com")
    owner_mcp = oauth_tokens(client, owner["access_token"])["access_token"]
    home = personal(client, owner["access_token"])
    error, spaces = _data(mcp_call(client, owner_mcp, "spatii_disponibile", {}))
    assert error is False
    assert [row["id"] for row in spaces["spatii"]] == [home["id"]]
    day = today().isoformat()
    food = category_id(categories(client, owner["access_token"], home["id"]), "Mâncare", "expense")
    cash = accounts(client, owner["access_token"], home["id"])[0]["id"]
    added = mcp_call(
        client,
        owner_mcp,
        "adauga_tranzactie",
        {"fel": "expense", "suma": "4.0000", "cont": "Numerar", "categorie": "Mâncare", "data": day, "descriere": "Ceai"},
    )
    error, first = _data(added)
    assert error is False, first
    assert first["origin"] == "asistent"
    error, second = _data(
        mcp_call(
            client,
            owner_mcp,
            "adauga_tranzactie",
            {"fel": "expense", "suma": "4.0000", "cont": "Numerar", "categorie": "Mâncare", "data": day, "descriere": "Ceai"},
        )
    )
    assert error is False
    assert second["id"] == first["id"]
    listed = client.get(f"/api/spaces/{home['id']}/transactions", headers=auth(owner["access_token"])).json()
    assert len(listed) == 1
    family = client.post(
        "/api/spaces",
        headers=auth(owner["access_token"]),
        json={"name": "Familia", "kind": "family"},
    ).json()
    error, message = _data(
        mcp_call(
            client,
            owner_mcp,
            "adauga_tranzactie",
            {"fel": "expense", "suma": "1.0000", "cont": "Numerar", "categorie": "Mâncare", "data": day},
        )
    )
    assert error is True
    assert "Familia" in message
    assert "Personal" in message
    after = client.get(f"/api/spaces/{home['id']}/transactions", headers=auth(owner["access_token"])).json()
    assert len(after) == 1
    from tests.helpers import accept, invite

    accept(client, viewer["access_token"], invite(client, caplog, owner["access_token"], family["id"], "mcp-viewer@example.com", "viewer"))
    accept(client, editor["access_token"], invite(client, caplog, owner["access_token"], family["id"], "mcp-editor@example.com", "editor"))
    viewer_mcp = oauth_tokens(client, viewer["access_token"])["access_token"]
    editor_mcp = oauth_tokens(client, editor["access_token"])["access_token"]
    error, message = _data(
        mcp_call(
            client,
            viewer_mcp,
            "adauga_tranzactie",
            {"fel": "expense", "suma": "1.0000", "cont": cash, "categorie": food, "spatiu": family["id"], "data": day},
        )
    )
    assert error is True
    created = client.post(
        f"/api/spaces/{home['id']}/transactions",
        headers=auth(owner["access_token"]),
        json={
            "kind": "expense",
            "amount": "6.0000",
            "account_id": cash,
            "category_id": food,
            "occurred_on": day,
            "description": "De sters",
        },
    ).json()
    error, message = _data(mcp_call(client, editor_mcp, "sterge_tranzactie", {"tranzactie_id": created["id"], "confirmat": True}))
    assert error is True
    untouched = client.get(f"/api/spaces/{home['id']}/transactions/{created['id']}", headers=auth(owner["access_token"])).json()
    assert untouched["deleted_at"] is None
    error, message = _data(mcp_call(client, owner_mcp, "sterge_tranzactie", {"tranzactie_id": created["id"]}))
    assert error is True
    still = client.get(f"/api/spaces/{home['id']}/transactions/{created['id']}", headers=auth(owner["access_token"])).json()
    assert still["deleted_at"] is None
    error, removed = _data(mcp_call(client, owner_mcp, "sterge_tranzactie", {"tranzactie_id": created["id"], "confirmat": True}))
    assert error is False, removed
    assert removed["deleted_at"]
    foreign = personal(client, outsider["access_token"])["id"]
    error, visible = _data(mcp_call(client, owner_mcp, "spatii_disponibile", {}))
    assert foreign not in {row["id"] for row in visible["spatii"]}
    error, message = _data(
        mcp_call(
            client,
            owner_mcp,
            "adauga_tranzactie",
            {"fel": "expense", "suma": "1.0000", "cont": "Numerar", "categorie": "Mâncare", "spatiu": foreign, "data": day},
        )
    )
    assert error is True
    outsider_rows = client.get(f"/api/spaces/{foreign}/transactions", headers=auth(outsider["access_token"])).json()
    assert outsider_rows == []
