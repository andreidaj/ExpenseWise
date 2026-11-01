from tests.helpers import auth, personal, verified


def test_export_contains_only_accessible_spaces(client, caplog):
    owner = verified(client, caplog, "export@example.com")
    other = verified(client, caplog, "export-alt@example.com")
    space_id = personal(client, owner["access_token"])["id"]
    exported = client.get("/api/export", headers=auth(owner["access_token"]))
    assert exported.status_code == 200, exported.text
    ids = {item["space"]["id"] for item in exported.json()["spaces"]}
    assert space_id in ids
    foreign = client.get("/api/export", headers=auth(other["access_token"])).json()
    assert space_id not in {item["space"]["id"] for item in foreign["spaces"]}
    assert all(item["space"]["owner_id"] == other["user"]["id"] for item in foreign["spaces"])
