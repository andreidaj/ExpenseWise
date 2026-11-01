from datetime import timedelta

from tests.helpers import accounts, auth, personal, today, verified


def test_account_crud_and_locked_currency(client, caplog):
    user = verified(client, caplog, "conturi@example.com")
    space_id = personal(client, user["access_token"])["id"]
    created = client.post(
        f"/api/spaces/{space_id}/accounts",
        headers=auth(user["access_token"]),
        json={
            "name": "Banca",
            "kind": "bank",
            "currency": "EUR",
            "opening_balance": "10.0000",
            "opening_balance_date": today().isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    account_id = created.json()["id"]
    renamed = client.patch(
        f"/api/spaces/{space_id}/accounts/{account_id}",
        headers=auth(user["access_token"]),
        json={"name": "Cardul", "currency": "EUR"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["currency"] == "EUR"
    assert renamed.json()["name"] == "Cardul"
    locked = client.patch(
        f"/api/spaces/{space_id}/accounts/{account_id}",
        headers=auth(user["access_token"]),
        json={"currency": "RON"},
    )
    assert locked.status_code == 409
    assert client.delete(
        f"/api/spaces/{space_id}/accounts/{account_id}",
        headers=auth(user["access_token"]),
    ).status_code == 204
    assert client.get(
        f"/api/spaces/{space_id}/accounts/{account_id}",
        headers=auth(user["access_token"]),
    ).status_code == 404
    listed = accounts(client, user["access_token"], space_id)
    assert account_id not in {row["id"] for row in listed}
    _ = timedelta
