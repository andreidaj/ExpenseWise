from tests.helpers import auth, personal, register, spaces, verified


def test_family_project_and_hidden_personal(client, caplog):
    owner = verified(client, caplog, "owner@example.com", name="Owner")
    home = personal(client, owner["access_token"])
    refused = client.post(
        f"/api/spaces/{home['id']}/invitations",
        headers=auth(owner["access_token"]),
        json={"email": "altul@example.com", "role": "viewer"},
    )
    assert refused.status_code == 403
    family = client.post(
        "/api/spaces",
        headers=auth(owner["access_token"]),
        json={"name": "Familia", "kind": "family"},
    )
    project = client.post(
        "/api/spaces",
        headers=auth(owner["access_token"]),
        json={"name": "Proiect", "kind": "project", "starts_on": "2026-01-01"},
    )
    assert family.status_code == 201 and family.json()["kind"] == "family"
    assert project.status_code == 201 and project.json()["kind"] == "project"
    other = verified(client, caplog, "altul@example.com", name="Altul")
    visible = spaces(client, other["access_token"])
    assert home["id"] not in {item["id"] for item in visible}
    hidden = client.get(f"/api/spaces/{home['id']}", headers=auth(other["access_token"]))
    assert hidden.status_code == 404
    _ = register
