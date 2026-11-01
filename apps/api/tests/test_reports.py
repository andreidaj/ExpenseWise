from tests.helpers import accounts, auth, categories, category_id, personal, today, verified


def test_separate_and_consolidated_only_visible_spaces(client, caplog):
    owner = verified(client, caplog, "raport@example.com")
    other = verified(client, caplog, "raport-alt@example.com")
    token = owner["access_token"]
    space_id = personal(client, token)["id"]
    day = today().isoformat()
    account_id = accounts(client, token, space_id)[0]["id"]
    salary = category_id(categories(client, token, space_id), "Salariu", "income")
    food = category_id(categories(client, token, space_id), "Mâncare", "expense")
    assert client.post(
        f"/api/spaces/{space_id}/transactions",
        headers=auth(token),
        json={
            "kind": "income",
            "amount": "100.0000",
            "account_id": account_id,
            "category_id": salary,
            "occurred_on": day,
            "description": "Salariu",
        },
    ).status_code == 201
    eur = client.post(
        f"/api/spaces/{space_id}/accounts",
        headers=auth(token),
        json={
            "name": "Euro",
            "kind": "bank",
            "currency": "EUR",
            "opening_balance": "0",
            "opening_balance_date": day,
        },
    ).json()
    assert client.post(
        f"/api/spaces/{space_id}/transactions",
        headers=auth(token),
        json={
            "kind": "expense",
            "amount": "8.0000",
            "account_id": eur["id"],
            "category_id": food,
            "occurred_on": day,
            "description": "Pranz",
            "fx_rate": "5",
        },
    ).status_code == 201
    separate = client.get("/api/reports", headers=auth(token), params={"from": day, "to": day}).json()
    assert separate["mode"] == "separate"
    assert space_id in separate["spaces"]
    by_currency = {row["currency"]: row for row in separate["totals"]}
    assert by_currency["RON"]["income"] == "100.0000"
    assert by_currency["EUR"]["expense"] == "8.0000"
    consolidated = client.get(
        "/api/reports",
        headers=auth(token),
        params={"from": day, "to": day, "currency": "RON"},
    ).json()
    assert consolidated["mode"] == "consolidated"
    assert consolidated["totals"] == [{"currency": "RON", "income": "100.0000", "expense": "40.0000"}]
    hidden = client.get("/api/reports", headers=auth(other["access_token"]), params={"space_id": space_id, "from": day, "to": day}).json()
    assert space_id not in hidden["spaces"]
    assert hidden["totals"] == []
