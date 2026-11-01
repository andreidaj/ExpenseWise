from datetime import timedelta

from tests.helpers import accounts, auth, categories, category_id, personal, today, verified


def test_two_missed_weeks_are_generated_once_and_pause_keeps_them(client, caplog):
    user = verified(client, caplog, "recurent@example.com")
    token = user["access_token"]
    space_id = personal(client, token)["id"]
    account_id = accounts(client, token, space_id)[0]["id"]
    food = category_id(categories(client, token, space_id), "Mâncare", "expense")
    start = today() - timedelta(days=14)
    created = client.post(
        f"/api/spaces/{space_id}/recurring-rules",
        headers=auth(token),
        json={
            "kind": "expense",
            "amount": "7.0000",
            "account_id": account_id,
            "category_id": food,
            "frequency": "weekly",
            "next_run_on": start.isoformat(),
            "description": "Abonament",
        },
    )
    assert created.status_code == 201, created.text
    first = client.get(f"/api/spaces/{space_id}/transactions", headers=auth(token))
    assert first.status_code == 200, first.text
    rows = first.json()
    dates = {row["occurred_on"] for row in rows}
    assert dates == {
        start.isoformat(),
        (start + timedelta(days=7)).isoformat(),
        (start + timedelta(days=14)).isoformat(),
    }
    assert all(row["recurring_rule_id"] == created.json()["id"] for row in rows)
    second = client.get(f"/api/spaces/{space_id}/transactions", headers=auth(token)).json()
    assert {row["id"] for row in second} == {row["id"] for row in rows}
    paused = client.patch(
        f"/api/spaces/{space_id}/recurring-rules/{created.json()['id']}",
        headers=auth(token),
        json={"paused": True},
    )
    assert paused.status_code == 200, paused.text
    assert paused.json()["paused_at"]
    after = client.get(f"/api/spaces/{space_id}/transactions", headers=auth(token)).json()
    assert len(after) == len(rows)
    assert all(row["deleted_at"] is None for row in after)
