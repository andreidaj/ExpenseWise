from tests.helpers import accept, accounts, auth, categories, category_id, invite, today, verified


def test_viewer_reads_editor_writes_admin_deletes(client, caplog):
    owner = verified(client, caplog, "inv-owner@example.com")
    viewer = verified(client, caplog, "inv-viewer@example.com")
    editor = verified(client, caplog, "inv-editor@example.com")
    admin = verified(client, caplog, "inv-admin@example.com")
    family = client.post(
        "/api/spaces",
        headers=auth(owner["access_token"]),
        json={"name": "Familia", "kind": "family"},
    ).json()
    account = client.post(
        f"/api/spaces/{family['id']}/accounts",
        headers=auth(owner["access_token"]),
        json={
            "name": "Comun",
            "kind": "cash",
            "currency": "RON",
            "opening_balance": "0",
            "opening_balance_date": today().isoformat(),
        },
    ).json()
    for person, role in ((viewer, "viewer"), (editor, "editor"), (admin, "admin")):
        raw = invite(client, caplog, owner["access_token"], family["id"], person["user"]["email"], role)
        accept(client, person["access_token"], raw)
    food = category_id(categories(client, owner["access_token"], family["id"]), "Mâncare", "expense")
    assert client.get(f"/api/spaces/{family['id']}/transactions", headers=auth(viewer["access_token"])).status_code == 200
    denied = client.post(
        f"/api/spaces/{family['id']}/transactions",
        headers=auth(viewer["access_token"]),
        json={
            "kind": "expense",
            "amount": "5.0000",
            "account_id": account["id"],
            "category_id": food,
            "occurred_on": today().isoformat(),
            "description": "Viewer",
        },
    )
    assert denied.status_code == 403
    created = client.post(
        f"/api/spaces/{family['id']}/transactions",
        headers=auth(editor["access_token"]),
        json={
            "kind": "expense",
            "amount": "8.0000",
            "account_id": account["id"],
            "category_id": food,
            "occurred_on": today().isoformat(),
            "description": "Editor",
        },
    )
    assert created.status_code == 201, created.text
    assert client.get(f"/api/spaces/{family['id']}", headers=auth(viewer["access_token"])).status_code == 200
    removed = client.delete(
        f"/api/spaces/{family['id']}/transactions/{created.json()['id']}",
        headers=auth(admin["access_token"]),
    )
    assert removed.status_code == 200
    assert removed.json()["deleted_at"]
    assert accounts(client, viewer["access_token"], family["id"])
