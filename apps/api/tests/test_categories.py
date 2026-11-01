from tests.helpers import accept, auth, categories, category_id, invite, verified


def test_seed_add_archive_and_permissions(client, caplog):
    owner = verified(client, caplog, "cat-owner@example.com")
    viewer = verified(client, caplog, "cat-viewer@example.com")
    editor = verified(client, caplog, "cat-editor@example.com")
    family = client.post(
        "/api/spaces",
        headers=auth(owner["access_token"]),
        json={"name": "Familia", "kind": "family"},
    ).json()
    rows = categories(client, owner["access_token"], family["id"])
    assert len([row for row in rows if row["kind"] == "income"]) == 4
    assert len([row for row in rows if row["kind"] == "expense"]) == 10
    created = client.post(
        f"/api/spaces/{family['id']}/categories",
        headers=auth(owner["access_token"]),
        json={"name": "Cafea", "kind": "expense"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["group_name"] == "Altele"
    placed = client.post(
        f"/api/spaces/{family['id']}/categories",
        headers=auth(owner["access_token"]),
        json={"name": "Restaurant", "kind": "expense", "group_name": "Zi de zi"},
    )
    assert placed.status_code == 201, placed.text
    assert placed.json()["group_name"] == "Zi de zi"
    raw_viewer = invite(client, caplog, owner["access_token"], family["id"], "cat-viewer@example.com", "viewer")
    raw_editor = invite(client, caplog, owner["access_token"], family["id"], "cat-editor@example.com", "editor")
    accept(client, viewer["access_token"], raw_viewer)
    accept(client, editor["access_token"], raw_editor)
    assert client.post(
        f"/api/spaces/{family['id']}/categories",
        headers=auth(viewer["access_token"]),
        json={"name": "X", "kind": "expense"},
    ).status_code == 403
    assert client.post(
        f"/api/spaces/{family['id']}/categories",
        headers=auth(editor["access_token"]),
        json={"name": "Y", "kind": "expense"},
    ).status_code == 403
    archived = client.delete(
        f"/api/spaces/{family['id']}/categories/{created.json()['id']}",
        headers=auth(owner["access_token"]),
    )
    assert archived.status_code == 200
    assert archived.json()["archived_at"]
    remaining = categories(client, owner["access_token"], family["id"])
    assert created.json()["id"] not in {row["id"] for row in remaining}
    assert category_id(rows, "Mâncare", "expense")
