import httpx
import respx
from sqlalchemy import text

from tests.helpers import accounts, auth, categories, category_id, personal, verified

PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


def test_missing_ocr_url_returns_503(client, caplog, monkeypatch):
    user = verified(client, caplog, "ocr-off@example.com")
    space_id = personal(client, user["access_token"])["id"]
    monkeypatch.setenv("OCR_URL", "")
    response = client.post(
        f"/api/spaces/{space_id}/receipts",
        headers=auth(user["access_token"]),
        files={"file": ("bon.png", PNG, "image/png")},
    )
    assert response.status_code == 503
    assert "OCR" in response.json()["detail"]


def test_draft_then_save_creates_ocr_transaction_without_image_bytes(client, caplog, monkeypatch):
    user = verified(client, caplog, "ocr-on@example.com")
    token = user["access_token"]
    space_id = personal(client, token)["id"]
    monkeypatch.setenv("OCR_URL", "http://ocr.test")
    with respx.mock:
        respx.post("http://ocr.test/extract").mock(
            return_value=httpx.Response(
                200,
                json={
                    "merchant": "Magazin",
                    "occurred_on": "2026-10-20",
                    "total_amount": "18.50",
                    "currency": "RON",
                    "lines": [{"text": "Paine"}],
                },
            )
        )
        draft = client.post(
            f"/api/spaces/{space_id}/receipts",
            headers=auth(token),
            files={"file": ("bon.png", PNG, "image/png")},
        )
    assert draft.status_code == 201, draft.text
    assert draft.json()["merchant"] == "Magazin"
    food = category_id(categories(client, token, space_id), "Mâncare", "expense")
    account_id = accounts(client, token, space_id)[0]["id"]
    saved = client.post(
        f"/api/spaces/{space_id}/receipts/{draft.json()['id']}/save",
        headers=auth(token),
        json={"account_id": account_id, "category_id": food},
    )
    assert saved.status_code == 201, saved.text
    assert saved.json()["origin"] == "ocr"
    assert saved.json()["amount"] == "18.5000"
    from app.database import engine

    with engine.connect() as conn:
        drafts = conn.execute(text("SELECT count(*) FROM receipt_drafts")).scalar_one()
        bytea = conn.execute(
            text(
                "SELECT count(*) FROM information_schema.columns "
                "WHERE table_schema = 'public' AND data_type = 'bytea'"
            )
        ).scalar_one()
        leaked = conn.execute(
            text(
                """
                SELECT count(*) FROM (
                  SELECT merchant::text AS value FROM receipt_drafts
                  UNION ALL
                  SELECT description FROM transactions
                  UNION ALL
                  SELECT lines::text FROM receipt_drafts
                ) rows
                WHERE value LIKE '%PNG%' OR value LIKE '%iVBORw0KGgo%'
                """
            )
        ).scalar_one()
    assert drafts == 0
    assert bytea == 0
    assert leaked == 0
