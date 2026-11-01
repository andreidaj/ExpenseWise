from tests.helpers import accept, accounts, auth, categories, category_id, invite, personal, today, verified


def _expense(client, token, space_id, account_id, category, amount, description="Pizza"):
    return client.post(
        f"/api/spaces/{space_id}/transactions",
        headers=auth(token),
        json={
            "kind": "expense",
            "amount": amount,
            "account_id": account_id,
            "category_id": category,
            "occurred_on": today().isoformat(),
            "description": description,
        },
    )


def test_income_expense_and_balance(client, caplog):
    user = verified(client, caplog, "sold@example.com")
    space_id = personal(client, user["access_token"])["id"]
    token = user["access_token"]
    account_id = accounts(client, token, space_id)[0]["id"]
    cats = categories(client, token, space_id)
    income = client.post(
        f"/api/spaces/{space_id}/transactions",
        headers=auth(token),
        json={
            "kind": "income",
            "amount": "100.0000",
            "account_id": account_id,
            "category_id": category_id(cats, "Salariu", "income"),
            "occurred_on": today().isoformat(),
            "description": "Salariu",
        },
    )
    expense = _expense(client, token, space_id, account_id, category_id(cats, "Mâncare", "expense"), "40.0000")
    assert income.status_code == 201, income.text
    assert expense.status_code == 201, expense.text
    balances = client.get(f"/api/spaces/{space_id}/balances", headers=auth(token)).json()["accounts"]
    cash = next(row for row in balances if row["id"] == account_id)
    assert cash["balance"] == "60.0000"


def test_editor_updates_any_transaction_viewer_cannot_write_admin_deletes(client, caplog):
    owner = verified(client, caplog, "tx-owner@example.com")
    editor = verified(client, caplog, "tx-editor@example.com")
    viewer = verified(client, caplog, "tx-viewer@example.com")
    family = client.post(
        "/api/spaces",
        headers=auth(owner["access_token"]),
        json={"name": "Familia", "kind": "family"},
    ).json()
    account = client.post(
        f"/api/spaces/{family['id']}/accounts",
        headers=auth(owner["access_token"]),
        json={
            "name": "Casa",
            "kind": "cash",
            "currency": "RON",
            "opening_balance": "0",
            "opening_balance_date": today().isoformat(),
        },
    ).json()
    cats = categories(client, owner["access_token"], family["id"])
    food = category_id(cats, "Mâncare", "expense")
    created = _expense(client, owner["access_token"], family["id"], account["id"], food, "15.0000", "Initial")
    assert created.status_code == 201, created.text
    accept(client, editor["access_token"], invite(client, caplog, owner["access_token"], family["id"], "tx-editor@example.com", "editor"))
    accept(client, viewer["access_token"], invite(client, caplog, owner["access_token"], family["id"], "tx-viewer@example.com", "viewer"))
    edited = client.patch(
        f"/api/spaces/{family['id']}/transactions/{created.json()['id']}",
        headers=auth(editor["access_token"]),
        json={"description": "Corectat de editor"},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["description"] == "Corectat de editor"
    assert edited.json()["created_by"] == owner["user"]["id"]
    forbidden = _expense(client, viewer["access_token"], family["id"], account["id"], food, "1.0000")
    assert forbidden.status_code == 403
    editor_delete = client.delete(
        f"/api/spaces/{family['id']}/transactions/{created.json()['id']}",
        headers=auth(editor["access_token"]),
    )
    assert editor_delete.status_code == 403
    removed = client.delete(
        f"/api/spaces/{family['id']}/transactions/{created.json()['id']}",
        headers=auth(owner["access_token"]),
    )
    assert removed.status_code == 200
    assert removed.json()["deleted_at"]
    listed = client.get(f"/api/spaces/{family['id']}/transactions", headers=auth(viewer["access_token"])).json()
    assert created.json()["id"] not in {row["id"] for row in listed}
    balance = client.get(f"/api/spaces/{family['id']}/balances", headers=auth(owner["access_token"])).json()
    assert balance["accounts"][0]["balance"] == "0.0000"
