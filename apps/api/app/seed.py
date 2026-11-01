from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.models import Account, Category, Space, SpaceMember
from decimal import Decimal

from app.money import currency_code, now_utc, today_bucharest

SEEDED_CATEGORIES = (
    ("income", "Intrări", ("Salariu", "Freelance", "Cadouri")),
    ("income", "Altele", ("Altele",)),
    ("expense", "Acasă", ("Locuință", "Utilități")),
    ("expense", "Zi de zi", ("Mâncare", "Transport", "Cumpărături")),
    ("expense", "Personal", ("Sănătate", "Educație", "Divertisment", "Abonamente")),
    ("expense", "Altele", ("Altele",)),
)


def seed_categories(db: Session, space_id: uuid.UUID) -> None:
    now = now_utc()
    for kind, group_name, names in SEEDED_CATEGORIES:
        for name in names:
            db.add(Category(space_id=space_id, name=name, kind=kind, group_name=group_name, created_at=now))


def create_space(
    db: Session,
    *,
    owner_id: uuid.UUID,
    name: str,
    kind: str,
    base_currency: str = "RON",
    starts_on: date | None = None,
    ends_on: date | None = None,
) -> Space:
    now = now_utc()
    space = Space(
        owner_id=owner_id,
        name=name.strip(),
        kind=kind,
        base_currency=currency_code(base_currency),
        starts_on=starts_on,
        ends_on=ends_on,
        created_at=now,
    )
    db.add(space)
    db.flush()
    db.add(SpaceMember(space_id=space.id, user_id=owner_id, role="owner", created_at=now))
    seed_categories(db, space.id)
    return space


def create_personal_bootstrap(db: Session, owner_id: uuid.UUID) -> tuple[Space, Account]:
    space = create_space(db, owner_id=owner_id, name="Personal", kind="personal", base_currency="RON")
    account = Account(
        space_id=space.id,
        name="Numerar",
        kind="cash",
        currency="RON",
        opening_balance=Decimal("0"),
        opening_balance_date=today_bucharest(),
        created_at=now_utc(),
    )
    db.add(account)
    db.flush()
    return space, account
