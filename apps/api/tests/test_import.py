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


ING = """Titular cont: Persoana Test
Data,,,Detalii tranzactie,Debit,,Credit,Balanta
01 noiembrie 2026,,,Cumparare POS,"104,80",,,"440,22"
,,,Tranzactie la:ROMPETROL RC221  RO  Recas,,,,
30 octombrie 2026,,,Incasare,,,"5,00","551,70"
,,,Ordonator:Cineva Test,,,,
,,,Detalii:Transfer,,,,
"""

REVOLUT = """Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-01-03 12:40:11,2026-01-04 08:02:19,Cafenea,-4.80,0.00,RON,COMPLETED,495.20
CARD_PAYMENT,Current,2026-01-13 11:11:11,2026-01-13 11:20:00,Anulata,-40.00,0.00,RON,REVERTED,
TOPUP,Current,2026-01-02 09:14:03,2026-01-02 09:14:05,Alimentare,500.00,1.00,RON,COMPLETED,500.00
"""


RAIFFEISEN = """Extras de cont
Valuta: LEI
Data inregistrarii,Data tranzactiei,Descrierea tranzactiei,Suma debit,Suma credit
08.07.2020,06.07.2020,LIDL 248 GAESTI,"169,99",
,,Card nr. 8222,,
09.07.2020,09.07.2020,Salariu,,"4.356,00"
,,"Soldul zilei: 09.07.2020",,"19.770,68"
10.07.2020,10.07.2020,Comision,"1,50",
"""

RAIFFEISEN_HTML = """<table>
<tr><td>Valuta: EUR</td></tr>
<tr><td>Data inregistrarii</td><td>Descrierea</td><td>Suma</td></tr>
<tr><td>08.07.2020</td><td>LIDL</td><td>-12,40</td></tr>
<tr><td>09.07.2020</td><td>Salariu</td><td>500,00</td></tr>
</table>
"""


def test_ing_and_revolut_statements_fill_date_amount_and_kind(client, caplog):
    user = verified(client, caplog, "banca@example.com")
    token = user["access_token"]
    space_id = personal(client, token)["id"]
    accounts = client.get(f"/api/spaces/{space_id}/accounts", headers=auth(token)).json()
    cash = next(row["id"] for row in accounts if row["name"] == "Numerar")
    ing = client.post(
        f"/api/spaces/{space_id}/imports",
        headers=auth(token),
        files={"file": ("tranzactii.csv", ING.encode(), "text/csv")},
        data={"account_id": cash},
    )
    assert ing.status_code == 201, ing.text
    ing_rows = ing.json()["rows"]
    assert len(ing_rows) == 2
    assert ing_rows[0]["error"] is None
    assert ing_rows[0]["mapped"]["occurred_on"] == "2026-11-01"
    assert ing_rows[0]["mapped"]["amount"] == "104.8000"
    assert ing_rows[0]["mapped"]["kind"] == "expense"
    assert "ROMPETROL" in ing_rows[0]["mapped"]["description"]
    assert ing_rows[1]["mapped"]["kind"] == "income"
    assert ing_rows[1]["mapped"]["amount"] == "5.0000"
    assert "Cineva Test" in ing_rows[1]["mapped"]["description"]
    revolut = client.post(
        f"/api/spaces/{space_id}/imports",
        headers=auth(token),
        files={"file": ("revolut.csv", REVOLUT.encode(), "text/csv")},
        data={"account_id": cash},
    )
    assert revolut.status_code == 201, revolut.text
    kept = [row for row in revolut.json()["rows"] if row["error"] is None]
    assert [(row["mapped"]["kind"], row["mapped"]["amount"], row["mapped"]["description"]) for row in kept] == [
        ("expense", "4.8000", "Cafenea"),
        ("income", "500.0000", "Alimentare"),
        ("expense", "1.0000", "Comision · Alimentare"),
    ]
    raiffeisen = client.post(
        f"/api/spaces/{space_id}/imports",
        headers=auth(token),
        files={"file": ("extras.csv", RAIFFEISEN.encode(), "text/csv")},
        data={"account_id": cash},
    )
    assert raiffeisen.status_code == 201, raiffeisen.text
    kept = [row for row in raiffeisen.json()["rows"] if row["error"] is None]
    assert [(row["mapped"]["occurred_on"], row["mapped"]["kind"], row["mapped"]["amount"], row["mapped"]["description"]) for row in kept] == [
        ("2020-07-08", "expense", "169.9900", "LIDL 248 GAESTI · Card nr. 8222"),
        ("2020-07-09", "income", "4356.0000", "Salariu"),
        ("2020-07-10", "expense", "1.5000", "Comision"),
    ]
    assert kept[0]["mapped"]["currency"] == "RON"
    html = client.post(
        f"/api/spaces/{space_id}/imports",
        headers=auth(token),
        files={"file": ("extras.xls", RAIFFEISEN_HTML.encode("cp1250"), "application/vnd.ms-excel")},
        data={"account_id": cash},
    )
    assert html.status_code == 201, html.text
    html_rows = html.json()["rows"]
    assert len(html_rows) == 2
    assert all(row["error"] == "Moneda nu corespunde contului." for row in html_rows)


def test_period_keeps_only_rows_inside_and_a_similar_amount_stays_unchecked(client, caplog):
    user = verified(client, caplog, "perioada@example.com")
    token = user["access_token"]
    space_id = personal(client, token)["id"]
    cash = next(row["id"] for row in client.get(f"/api/spaces/{space_id}/accounts", headers=auth(token)).json() if row["name"] == "Numerar")
    cats = client.get(f"/api/spaces/{space_id}/categories", headers=auth(token)).json()
    food = next(row["id"] for row in cats if row["name"] == "Mâncare" and row["kind"] == "expense")
    manual = client.post(
        f"/api/spaces/{space_id}/transactions",
        headers=auth(token),
        json={
            "kind": "expense",
            "amount": "104.8000",
            "account_id": cash,
            "category_id": food,
            "occurred_on": "2026-11-01",
            "description": "Motorina",
        },
    )
    assert manual.status_code == 201, manual.text
    preview = client.post(
        f"/api/spaces/{space_id}/imports",
        headers=auth(token),
        files={"file": ("tranzactii.csv", ING.encode(), "text/csv")},
        data={"account_id": cash, "date_from": "2026-11-01", "date_to": "2026-11-01"},
    )
    assert preview.status_code == 201, preview.text
    rows = preview.json()["rows"]
    assert rows[0]["outside"] is False
    assert rows[0]["similar"]["description"] == "Motorina"
    assert rows[0]["duplicate"] is False
    assert rows[1]["outside"] is True
    chosen = [rows[0]["id"]]
    confirmed = client.post(
        f"/api/spaces/{space_id}/imports/{preview.json()['id']}/confirm",
        headers=auth(token),
        json={"include_row_ids": chosen},
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["imported"] == 1
    listed = client.get(f"/api/spaces/{space_id}/transactions", headers=auth(token)).json()
    assert len(listed) == 2
