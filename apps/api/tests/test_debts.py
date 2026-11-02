from tests.helpers import accounts, auth, personal, today, verified


def test_a_loan_lowers_the_balance_and_stays_out_of_expenses(client, caplog):
    user = verified(client, caplog, "datorie@example.com")
    token = user["access_token"]
    space_id = personal(client, token)["id"]
    account_id = accounts(client, token, space_id)[0]["id"]
    day = today().isoformat()
    created = client.post(
        f"/api/spaces/{space_id}/debts",
        headers=auth(token),
        json={"person_name": "Ion", "amount": "500.0000", "account_id": account_id, "occurred_on": day},
    )
    assert created.status_code == 201, created.text
    assert created.json()["remaining"] == "500.0000"
    balances = client.get(f"/api/spaces/{space_id}/balances", headers=auth(token)).json()["accounts"]
    assert next(row for row in balances if row["id"] == account_id)["balance"] == "-500.0000"
    report = client.get("/api/reports", headers=auth(token), params={"from": day, "to": day}).json()
    assert report["totals"] == []
    partial = client.post(
        f"/api/spaces/{space_id}/debts/{created.json()['id']}/repayments",
        headers=auth(token),
        json={"amount": "200.0000", "account_id": account_id, "occurred_on": day},
    )
    assert partial.status_code == 201, partial.text
    assert partial.json()["remaining"] == "300.0000"
    balances = client.get(f"/api/spaces/{space_id}/balances", headers=auth(token)).json()["accounts"]
    assert next(row for row in balances if row["id"] == account_id)["balance"] == "-300.0000"
    too_much = client.post(
        f"/api/spaces/{space_id}/debts/{created.json()['id']}/repayments",
        headers=auth(token),
        json={"amount": "400.0000", "account_id": account_id, "occurred_on": day},
    )
    assert too_much.status_code == 422
    rest = client.post(
        f"/api/spaces/{space_id}/debts/{created.json()['id']}/repayments",
        headers=auth(token),
        json={"amount": "300.0000", "account_id": account_id, "occurred_on": day},
    )
    assert rest.status_code == 201, rest.text
    assert client.get(f"/api/spaces/{space_id}/debts", headers=auth(token)).json() == []
    balances = client.get(f"/api/spaces/{space_id}/balances", headers=auth(token)).json()["accounts"]
    assert next(row for row in balances if row["id"] == account_id)["balance"] == "0.0000"
    report = client.get("/api/reports", headers=auth(token), params={"from": day, "to": day}).json()
    assert report["totals"] == []
