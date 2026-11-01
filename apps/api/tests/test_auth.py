from tests.helpers import accept, auth, grab, invite, personal, register, spaces, verified


def test_register_opens_personal_space_immediately(client):
    response = register(client, "ana@example.com", name="Ana")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["user"]["email_verified_at"]
    home = personal(client, body["access_token"])
    assert home["name"] == "Personal"
    assert home["kind"] == "personal"
    assert home["role"] == "owner"
    cash = client.get(f"/api/spaces/{home['id']}/accounts", headers=auth(body["access_token"])).json()
    assert cash[0]["name"] == "Numerar"
    assert cash[0]["kind"] == "cash"
    assert cash[0]["currency"] == "RON"
    assert cash[0]["opening_balance"] == "0.0000"
    names = client.get(f"/api/spaces/{home['id']}/categories", headers=auth(body["access_token"])).json()
    income = {row["name"] for row in names if row["kind"] == "income"}
    expense = {row["name"] for row in names if row["kind"] == "expense"}
    assert income == {"Salariu", "Freelance", "Cadouri", "Altele"}
    assert expense == {
        "Mâncare",
        "Transport",
        "Locuință",
        "Utilități",
        "Sănătate",
        "Educație",
        "Divertisment",
        "Cumpărături",
        "Abonamente",
        "Altele",
    }


def test_existing_unverified_account_can_use_money_and_login_marks_it(client, caplog):
    user = verified(client, caplog, "vechi@example.com")
    from sqlalchemy import update

    from app.database import SessionLocal
    from app.models import User

    db = SessionLocal()
    try:
        db.execute(update(User).where(User.email == "vechi@example.com").values(email_verified_at=None))
        db.commit()
    finally:
        db.close()

    opened = client.get("/api/spaces", headers=auth(user["access_token"]))
    assert opened.status_code == 200, opened.text
    logged = client.post("/api/auth/login", json={"email": "vechi@example.com", "password": "parola123"})
    assert logged.status_code == 200, logged.text
    assert logged.json()["user"]["email_verified_at"]


def test_login_wrong_password_and_missing_token(client, caplog):
    user = verified(client, caplog, "login@example.com")
    ok = client.post("/api/auth/login", json={"email": "login@example.com", "password": "parola123"})
    assert ok.status_code == 200
    bad = client.post("/api/auth/login", json={"email": "login@example.com", "password": "gresita123"})
    missing = client.post("/api/auth/login", json={"email": "no@example.com", "password": "parola123"})
    assert bad.status_code == 401
    assert missing.status_code == 401
    assert bad.json()["detail"] == missing.json()["detail"]
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers=auth(user["access_token"])).status_code == 200


def test_refresh_rotation_and_logout(client, caplog):
    user = verified(client, caplog, "rotatie@example.com")
    first = user["refresh_token"]
    rotated = client.post("/api/auth/refresh", headers=auth(first))
    assert rotated.status_code == 200, rotated.text
    second = rotated.json()["refresh_token"]
    assert second != first
    assert client.post("/api/auth/refresh", headers=auth(first)).status_code == 401
    assert client.post("/api/auth/logout", headers=auth(second)).status_code == 204
    assert client.post("/api/auth/refresh", headers=auth(second)).status_code == 401


def test_reset_is_neutral_and_revokes_sessions(client, caplog):
    user = verified(client, caplog, "reset@example.com")
    caplog.clear()
    unknown = client.post("/api/auth/forgot-password", json={"email": "lipsa@example.com"})
    known = client.post("/api/auth/forgot-password", json={"email": "reset@example.com"})
    assert unknown.status_code == 200
    assert known.status_code == 200
    assert unknown.json() == known.json()
    token = grab(caplog.text, "/resetare-parola")
    changed = client.post("/api/auth/reset-password", json={"token": token, "password": "nouaParola1"})
    assert changed.status_code == 200
    assert client.post("/api/auth/refresh", headers=auth(user["refresh_token"])).status_code == 401
    old = client.post("/api/auth/login", json={"email": "reset@example.com", "password": "parola123"})
    new = client.post("/api/auth/login", json={"email": "reset@example.com", "password": "nouaParola1"})
    assert old.status_code == 401
    assert new.status_code == 200


def test_short_password_and_rate_limit(client):
    short = register(client, "scurt@example.com", password="scurt")
    assert short.status_code == 422
    for index in range(5):
        created = register(client, f"limita{index}@example.com")
        assert created.status_code == 201, created.text
    blocked = register(client, "limita6@example.com")
    assert blocked.status_code == 429


def test_login_locks_after_repeated_failures(client, caplog):
    verified(client, caplog, "blocat@example.com")
    for _ in range(10):
        failed = client.post("/api/auth/login", json={"email": "blocat@example.com", "password": "gresita123"})
        assert failed.status_code == 401
    locked = client.post("/api/auth/login", json={"email": "blocat@example.com", "password": "parola123"})
    assert locked.status_code == 429
