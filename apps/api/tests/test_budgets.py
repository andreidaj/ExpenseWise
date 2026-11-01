from tests.helpers import accounts, auth, categories, category_id, personal, today, verified


def test_consumed_remaining_and_eur_expense_in_ron_budget(client, caplog):
    user = verified(client, caplog, "buget@example.com")
    token = user["access_token"]
    space_id = personal(client, token)["id"]
    day = today()
    cash = accounts(client, token, space_id)[0]["id"]
    food = category_id(categories(client, token, space_id), "Mâncare", "expense")
    eur = client.post(
        f"/api/spaces/{space_id}/accounts",
        headers=auth(token),
        json={
            "name": "Euro",
            "kind": "bank",
            "currency": "EUR",
            "opening_balance": "0",
            "opening_balance_date": day.isoformat(),
        },
    )
    assert eur.status_code == 201, eur.text
    spent_ron = client.post(
        f"/api/spaces/{space_id}/transactions",
        headers=auth(token),
        json={
            "kind": "expense",
            "amount": "20.0000",
            "account_id": cash,
            "category_id": food,
            "occurred_on": day.isoformat(),
            "description": "Paine",
        },
    )
    spent_eur = client.post(
        f"/api/spaces/{space_id}/transactions",
        headers=auth(token),
        json={
            "kind": "expense",
            "amount": "10.0000",
            "account_id": eur.json()["id"],
            "category_id": food,
            "occurred_on": day.isoformat(),
            "description": "Cafea",
            "fx_rate": "5",
        },
    )
    assert spent_ron.status_code == 201, spent_ron.text
    assert spent_eur.status_code == 201, spent_eur.text
    budget = client.post(
        f"/api/spaces/{space_id}/budgets",
        headers=auth(token),
        json={
            "category_id": food,
            "year": day.year,
            "month": day.month,
            "limit_amount": "100.0000",
            "currency": "RON",
        },
    )
    assert budget.status_code == 201, budget.text
    body = budget.json()
    assert body["consumed"] == "70.0000"
    assert body["remaining"] == "30.0000"
    assert body["percent"] == "70.00"


def test_period_starts_on_the_saved_day_and_a_custom_range_can_override_it(client, caplog):
    user = verified(client, caplog, "perioada@example.com")
    token = user["access_token"]
    me = client.get("/api/me", headers=auth(token))
    assert me.status_code == 200, me.text
    assert me.json()["period_start_day"] == 1
    saved = client.patch("/api/me", headers=auth(token), json={"period_start_day": 21})
    assert saved.status_code == 200, saved.text
    assert saved.json()["period_start_day"] == 21
    rejected = client.patch("/api/me", headers=auth(token), json={"period_start_day": 32})
    assert rejected.status_code == 422

    space_id = personal(client, token)["id"]
    cash = accounts(client, token, space_id)[0]["id"]
    food = category_id(categories(client, token, space_id), "Mâncare", "expense")

    def spend(day: str, amount: str) -> None:
        response = client.post(
            f"/api/spaces/{space_id}/transactions",
            headers=auth(token),
            json={
                "kind": "expense",
                "amount": amount,
                "account_id": cash,
                "category_id": food,
                "occurred_on": day,
                "description": day,
            },
        )
        assert response.status_code == 201, response.text

    spend("2026-10-20", "10.0000")
    spend("2026-10-21", "20.0000")
    spend("2026-11-20", "30.0000")
    spend("2026-11-21", "40.0000")
    budget = client.post(
        f"/api/spaces/{space_id}/budgets",
        headers=auth(token),
        json={
            "category_id": food,
            "year": 2026,
            "month": 10,
            "limit_amount": "1000.0000",
            "currency": "RON",
        },
    )
    assert budget.status_code == 201, budget.text
    assert budget.json()["consumed"] == "50.0000"
    listed = client.get(
        f"/api/spaces/{space_id}/budgets",
        headers=auth(token),
        params={"from": "2026-10-18", "to": "2026-10-21"},
    )
    assert listed.status_code == 200, listed.text
    row = next(item for item in listed.json() if item["month"] == 10)
    assert row["consumed"] == "30.0000"
