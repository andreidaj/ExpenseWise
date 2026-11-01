from tests.helpers import accounts, auth, categories, category_id, personal, today, verified


def test_goal_progress_comes_from_goal_id(client, caplog):
    user = verified(client, caplog, "obiectiv@example.com")
    token = user["access_token"]
    space_id = personal(client, token)["id"]
    account_id = accounts(client, token, space_id)[0]["id"]
    salary = category_id(categories(client, token, space_id), "Salariu", "income")
    goal = client.post(
        f"/api/spaces/{space_id}/goals",
        headers=auth(token),
        json={"name": "Vacanță", "target_amount": "200.0000", "currency": "RON"},
    )
    assert goal.status_code == 201, goal.text
    assert goal.json()["progress"] == "0.0000"
    saved = client.post(
        f"/api/spaces/{space_id}/transactions",
        headers=auth(token),
        json={
            "kind": "income",
            "amount": "50.0000",
            "account_id": account_id,
            "category_id": salary,
            "goal_id": goal.json()["id"],
            "occurred_on": today().isoformat(),
            "description": "Economii",
        },
    )
    assert saved.status_code == 201, saved.text
    progress = client.get(f"/api/spaces/{space_id}/goals/{goal.json()['id']}", headers=auth(token))
    assert progress.status_code == 200, progress.text
    assert progress.json()["progress"] == "50.0000"
    assert progress.json()["remaining"] == "150.0000"
    assert progress.json()["percent"] == "25.00"
