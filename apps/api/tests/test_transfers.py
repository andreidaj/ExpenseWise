from tests.helpers import auth, categories, category_id, personal, today, verified


def test_transfer_does_not_increase_expenses(client, caplog):
    user = verified(client, caplog, "transfer@example.com")
    token = user["access_token"]
    space_id = personal(client, token)["id"]
    day = today().isoformat()
    source = client.post(
        f"/api/spaces/{space_id}/accounts",
        headers=auth(token),
        json={"name": "Curent", "kind": "bank", "currency": "RON", "opening_balance": "100.0000", "opening_balance_date": day},
    ).json()
    target = client.post(
        f"/api/spaces/{space_id}/accounts",
        headers=auth(token),
        json={"name": "Economii", "kind": "savings", "currency": "RON", "opening_balance": "50.0000", "opening_balance_date": day},
    ).json()
    moved = client.post(
        f"/api/spaces/{space_id}/transactions",
        headers=auth(token),
        json={
            "kind": "transfer",
            "amount": "30.0000",
            "account_id": source["id"],
            "counter_account_id": target["id"],
            "occurred_on": day,
            "description": "Mutare",
        },
    )
    assert moved.status_code == 201, moved.text
    food = category_id(categories(client, token, space_id), "Mâncare", "expense")
    spent = client.post(
        f"/api/spaces/{space_id}/transactions",
        headers=auth(token),
        json={
            "kind": "expense",
            "amount": "10.0000",
            "account_id": source["id"],
            "category_id": food,
            "occurred_on": day,
            "description": "Paine",
        },
    )
    assert spent.status_code == 201, spent.text
    balances = {
        row["name"]: row["balance"]
        for row in client.get(f"/api/spaces/{space_id}/balances", headers=auth(token)).json()["accounts"]
    }
    assert balances["Curent"] == "60.0000"
    assert balances["Economii"] == "80.0000"
    report = client.get(
        "/api/reports",
        headers=auth(token),
        params={"space_id": space_id, "from": day, "to": day},
    ).json()
    ron = next(row for row in report["totals"] if row["currency"] == "RON")
    assert ron["expense"] == "10.0000"
    assert ron["income"] == "0.0000"
