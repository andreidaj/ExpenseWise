import httpx
import respx

from tests.helpers import auth, categories, category_id, personal, today, verified


def _eur(client, token, space_id, day):
    response = client.post(
        f"/api/spaces/{space_id}/accounts",
        headers=auth(token),
        json={
            "name": "Euro",
            "kind": "bank",
            "currency": "EUR",
            "opening_balance": "0",
            "opening_balance_date": day,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _spend(client, token, space_id, account_id, category, day, amount, **extra):
    return client.post(
        f"/api/spaces/{space_id}/transactions",
        headers=auth(token),
        json={
            "kind": "expense",
            "amount": amount,
            "account_id": account_id,
            "category_id": category,
            "occurred_on": day,
            "description": extra.pop("description", "Test"),
            **extra,
        },
    )


def test_manual_rate_frankfurter_and_missing_rate(client, caplog):
    user = verified(client, caplog, "curs@example.com")
    token = user["access_token"]
    space_id = personal(client, token)["id"]
    day = today().isoformat()
    account_id = _eur(client, token, space_id, day)
    food = category_id(categories(client, token, space_id), "Mâncare", "expense")
    manual = client.post(
        "/api/exchange-rates",
        headers=auth(token),
        json={"base_currency": "EUR", "quote_currency": "RON", "rate_date": day, "rate": "4.50000000"},
    )
    assert manual.status_code == 201, manual.text
    used = _spend(client, token, space_id, account_id, food, day, "2.0000", description="Manual")
    assert used.status_code == 201, used.text
    assert used.json()["fx_source"] == "manual"
    assert used.json()["fx_rate"] == "4.50000000"

    other = "2026-01-15"
    with respx.mock:
        respx.get(f"https://api.frankfurter.app/{other}").mock(
            return_value=httpx.Response(200, json={"amount": 1, "base": "EUR", "date": other, "rates": {"RON": 4.9}})
        )
        fetched = _spend(client, token, space_id, account_id, food, other, "1.0000", description="Frankfurter")
    assert fetched.status_code == 201, fetched.text
    assert fetched.json()["fx_source"] == "frankfurter"
    assert fetched.json()["fx_rate"] == "4.90000000"

    missing_day = "2026-02-02"
    with respx.mock:
        respx.get(f"https://api.frankfurter.app/{missing_day}").mock(return_value=httpx.Response(404))
        missing = _spend(client, token, space_id, account_id, food, missing_day, "3.0000", description="Fara curs")
    assert missing.status_code == 201, missing.text
    assert missing.json()["fx_rate"] is None
    report = client.get(
        "/api/reports",
        headers=auth(token),
        params={"space_id": space_id, "from": "2026-01-01", "to": day, "currency": "RON"},
    ).json()
    assert report["mode"] == "consolidated"
    assert missing.json()["id"] in {row["transaction_id"] for row in report["fara_curs"]}
    expense = next(row["expense"] for row in report["totals"] if row["currency"] == "RON")
    assert expense == "13.9000"
