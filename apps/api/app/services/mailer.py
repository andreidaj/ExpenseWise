from __future__ import annotations

import logging
import os

import httpx

log = logging.getLogger("expensewise.mail")
log.setLevel(logging.INFO)


def app_public_url() -> str:
    return os.environ.get("APP_PUBLIC_URL", "http://localhost:3000").strip().rstrip("/")


def deliver(purpose: str, address: str, link: str) -> None:
    key = os.environ.get("RESEND_API_KEY", "").strip()
    if not key:
        log.info("ExpenseWise email %s for %s: %s", purpose, address, link)
        return
    sender = os.environ.get("EMAIL_FROM", "ExpenseWise <noreply@localhost>")
    subjects = {
        "verify_email": "Confirmă adresa ExpenseWise",
        "reset_password": "Resetare parolă ExpenseWise",
        "invitation": "Invitație ExpenseWise",
    }
    try:
        httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "from": sender,
                "to": [address],
                "subject": subjects.get(purpose, "ExpenseWise"),
                "text": link,
            },
            timeout=15,
        )
    except httpx.HTTPError:
        log.info("ExpenseWise email %s for %s: %s", purpose, address, link)
