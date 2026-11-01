from tests.helpers import auth, personal, today, verified

CSV = """date,amount,currency,description,account,category,kind
{day},12.50,RON,Paine,Numerar,Mâncare,expense
{day},12.50,RON,Paine,Numerar,Mâncare,expense
"""


def test_preview_confirm_and_second_file_does_not_duplicate(client, caplog):
    user = verified(client, caplog, "import@example.com")
    token = user["access_token"]
    space_id = personal(client, token)["id"]
    day = today().isoformat()
    content = CSV.format(day=day).encode()
    preview = client.post(
        f"/api/spaces/{space_id}/imports",
        headers=auth(token),
        files={"file": ("tranzactii.csv", content, "text/csv")},
    )
    assert preview.status_code == 201, preview.text
    body = preview.json()
    assert body["status"] == "preview"
    assert body["rows"][0]["duplicate"] is False
    assert body["rows"][1]["duplicate"] is True
    confirmed = client.post(
        f"/api/spaces/{space_id}/imports/{body['id']}/confirm",
        headers=auth(token),
        json={},
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["imported"] == 1
    assert confirmed.json()["skipped"] == 1
    again = client.post(
        f"/api/spaces/{space_id}/imports/{body['id']}/confirm",
        headers=auth(token),
        json={},
    )
    assert again.status_code == 409
    second = client.post(
        f"/api/spaces/{space_id}/imports",
        headers=auth(token),
        files={"file": ("tranzactii.csv", content, "text/csv")},
    )
    assert second.status_code == 201, second.text
    assert all(row["duplicate"] for row in second.json()["rows"])
    confirmed_again = client.post(
        f"/api/spaces/{space_id}/imports/{second.json()['id']}/confirm",
        headers=auth(token),
        json={},
    )
    assert confirmed_again.json()["imported"] == 0
    listed = client.get(f"/api/spaces/{space_id}/transactions", headers=auth(token)).json()
    assert len(listed) == 1
    assert listed[0]["origin"] == "import"
    assert listed[0]["amount"] == "12.5000"
