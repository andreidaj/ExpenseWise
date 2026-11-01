from __future__ import annotations

import uuid
from contextvars import ContextVar
from datetime import date
from decimal import Decimal

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.fastmcp.exceptions import ToolError
from mcp.types import ToolAnnotations
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.deps import role_at_least
from app.errors import AppError
from app.models import Account, Budget, Category, Goal, Space, SpaceMember, Transaction, User
from app.money import currency_code, fmt_amount, parse_positive, parse_rate, today_bucharest
from app.serialize import transaction_out
from app.services import assistant_idempotency_service as idem
from app.services.ledger import (
    budget_figures,
    build_report,
    create_transaction,
    ensure_generated,
    goal_figures,
    list_balances,
    soft_delete,
    update_transaction,
    upsert_budget,
)
from app.services.spaces import create_category

INSTRUCTIONS = """Ești asistentul ExpenseWise. Lucrezi doar în spațiile utilizatorului autentificat.
Dacă sunt mai multe spații și nu este clar despre care este vorba, cheamă spatii_disponibile și întreabă.
Nu inventa categorii: folosește categorii. Nu alege singur când există mai multe potriviri.
Pentru o cheltuială sau un venit nou, cheamă adauga_tranzactie.
Nu chema modifica_tranzactie sau sterge_tranzactie decât dacă utilizatorul a cerut explicit modificarea sau ștergerea. Atunci trimite confirmat=true.
La sume în altă monedă decât RON, arată cursul și sursa lui.
Invitațiile, rolurile, importul și bonurile se fac în aplicație, nu aici."""

assistant_actor: ContextVar[dict | None] = ContextVar("assistant_actor", default=None)
READ = ToolAnnotations(readOnlyHint=True)
DESTRUCTIVE = ToolAnnotations(destructiveHint=True)
ADD = ToolAnnotations(idempotentHint=False)


def _actor() -> tuple[uuid.UUID, uuid.UUID]:
    token = get_access_token()
    if token is not None and token.subject and token.claims and token.claims.get("grant_id"):
        return uuid.UUID(token.subject), uuid.UUID(token.claims["grant_id"])
    current = assistant_actor.get()
    if not current:
        raise ToolError("Neautentificat.")
    return uuid.UUID(current["user_id"]), uuid.UUID(current["grant_id"])


def _period_start_day(db: Session, user_id: uuid.UUID) -> int:
    user = db.get(User, user_id)
    if user is None:
        return 1
    return user.period_start_day


def _memberships(db: Session, user_id: uuid.UUID) -> list[tuple[Space, SpaceMember]]:
    rows = db.execute(
        select(Space, SpaceMember)
        .join(SpaceMember, SpaceMember.space_id == Space.id)
        .where(SpaceMember.user_id == user_id)
        .order_by(Space.name)
    ).all()
    return [(space, member) for space, member in rows]


def _resolve_space(db: Session, user_id: uuid.UUID, spatiu: str | None) -> tuple[Space, SpaceMember]:
    rows = _memberships(db, user_id)
    if not spatiu:
        if len(rows) == 1:
            return rows[0]
        if not rows:
            raise ToolError("Nu ai niciun spațiu.")
        listing = ", ".join(f"{space.name} ({space.id})" for space, _member in rows)
        raise ToolError(f"Sunt mai multe spații. Întreabă utilizatorul: {listing}")
    try:
        wanted = uuid.UUID(spatiu)
    except ValueError:
        wanted = None
    if wanted is not None:
        for space, member in rows:
            if space.id == wanted:
                return space, member
        raise ToolError("Spațiul nu este disponibil.")
    needle = spatiu.casefold()
    exact = [(space, member) for space, member in rows if space.name.casefold() == needle]
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        listing = ", ".join(space.name for space, _member in exact)
        raise ToolError(f"Mai multe spații se potrivesc: {listing}")
    partial = [(space, member) for space, member in rows if needle in space.name.casefold()]
    if len(partial) == 1:
        return partial[0]
    if len(partial) > 1:
        listing = ", ".join(space.name for space, _member in partial)
        raise ToolError(f"Mai multe spații se potrivesc: {listing}")
    raise ToolError("Spațiul nu este disponibil.")


def _resolve_named(items, label: str, value: str | None):
    if not value:
        if len(items) == 1:
            return items[0]
        listing = ", ".join(f"{item.name} ({item.id})" for item in items)
        raise ToolError(f"Alege {label}: {listing}")
    try:
        wanted = uuid.UUID(value)
    except ValueError:
        wanted = None
    if wanted is not None:
        for item in items:
            if item.id == wanted:
                return item
        raise ToolError(f"{label} nu este disponibil.")
    needle = value.casefold()
    exact = [item for item in items if item.name.casefold() == needle]
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        raise ToolError(f"Mai multe potriviri pentru {label}: " + ", ".join(item.name for item in exact))
    partial = [item for item in items if needle in item.name.casefold()]
    if len(partial) == 1:
        return partial[0]
    if not partial:
        raise ToolError(f"{label} nu este disponibil.")
    raise ToolError(f"Mai multe potriviri pentru {label}: " + ", ".join(item.name for item in partial))


def _accounts(db: Session, space_id: uuid.UUID) -> list[Account]:
    return list(
        db.scalars(
            select(Account).where(Account.space_id == space_id, Account.archived_at.is_(None)).order_by(Account.name)
        ).all()
    )


def _categories(db: Session, space_id: uuid.UUID, kind: str | None = None) -> list[Category]:
    query = select(Category).where(Category.space_id == space_id, Category.archived_at.is_(None))
    if kind:
        query = query.where(Category.kind == kind)
    return list(db.scalars(query.order_by(Category.name)).all())


def _require(member: SpaceMember, minimum: str) -> None:
    if not role_at_least(member.role, minimum):
        raise ToolError("Nu ai permisiunea pentru această acțiune.")


def _tx_dict(tx: Transaction) -> dict:
    data = transaction_out(tx)
    return data


def register_tools(mcp) -> None:
    @mcp.tool(annotations=READ, structured_output=False)
    def spatii_disponibile() -> dict:
        user_id, _grant = _actor()
        db = SessionLocal()
        try:
            rows = _memberships(db, user_id)
            return {
                "spatii": [
                    {
                        "id": str(space.id),
                        "nume": space.name,
                        "rol": member.role,
                        "fel": space.kind,
                        "moneda": space.base_currency.strip(),
                    }
                    for space, member in rows
                ]
            }
        finally:
            db.close()

    @mcp.tool(annotations=READ, structured_output=False)
    def conturi(spatiu: str | None = None) -> dict:
        user_id, _grant = _actor()
        db = SessionLocal()
        try:
            space, member = _resolve_space(db, user_id, spatiu)
            _require(member, "viewer")
            ensure_generated(db, space)
            db.commit()
            return {
                "conturi": [
                    {
                        "id": str(item["id"]),
                        "nume": item["name"],
                        "fel": item["kind"],
                        "moneda": item["currency"],
                        "sold": item["balance"],
                    }
                    for item in list_balances(db, space)
                ]
            }
        finally:
            db.close()

    @mcp.tool(annotations=READ, structured_output=False)
    def categorii(spatiu: str | None = None, fel: str | None = None) -> dict:
        user_id, _grant = _actor()
        db = SessionLocal()
        try:
            space, member = _resolve_space(db, user_id, spatiu)
            _require(member, "viewer")
            return {
                "categorii": [
                    {"id": str(row.id), "nume": row.name, "fel": row.kind} for row in _categories(db, space.id, fel)
                ]
            }
        finally:
            db.close()

    @mcp.tool(annotations=READ, structured_output=False)
    def cauta_tranzactii(
        spatiu: str | None = None,
        cont: str | None = None,
        categorie: str | None = None,
        de_la: str | None = None,
        pana_la: str | None = None,
        cautare: str | None = None,
        moneda: str | None = None,
        limita: int = 20,
    ) -> dict:
        if limita < 1 or limita > 100:
            raise ToolError("limita trebuie să fie între 1 și 100.")
        user_id, _grant = _actor()
        db = SessionLocal()
        try:
            space, member = _resolve_space(db, user_id, spatiu)
            _require(member, "viewer")
            ensure_generated(db, space)
            db.commit()
            query = select(Transaction).where(Transaction.space_id == space.id, Transaction.deleted_at.is_(None))
            if cont:
                account = _resolve_named(_accounts(db, space.id), "contul", cont)
                query = query.where(or_(Transaction.account_id == account.id, Transaction.counter_account_id == account.id))
            if categorie:
                category = _resolve_named(_categories(db, space.id), "categoria", categorie)
                query = query.where(Transaction.category_id == category.id)
            if de_la:
                query = query.where(Transaction.occurred_on >= date.fromisoformat(de_la))
            if pana_la:
                query = query.where(Transaction.occurred_on <= date.fromisoformat(pana_la))
            if moneda:
                query = query.where(Transaction.currency == currency_code(moneda))
            if cautare:
                query = query.where(Transaction.description.ilike(f"%{cautare}%"))
            total = int(db.scalar(select(func.count()).select_from(query.subquery())) or 0)
            rows = db.scalars(query.order_by(Transaction.occurred_on.desc()).limit(limita)).all()
            return {"tranzactii": [_tx_dict(row) for row in rows], "total": total, "limita": limita}
        finally:
            db.close()

    @mcp.tool(annotations=READ, structured_output=False)
    def detalii_tranzactie(tranzactie_id: str) -> dict:
        user_id, _grant = _actor()
        db = SessionLocal()
        try:
            tx = db.get(Transaction, uuid.UUID(tranzactie_id))
            visible = {space.id for space, _member in _memberships(db, user_id)}
            if tx is None or tx.space_id not in visible or tx.deleted_at is not None:
                raise ToolError("Tranzacția nu este disponibilă.")
            return _tx_dict(tx)
        finally:
            db.close()

    @mcp.tool(annotations=READ, structured_output=False)
    def bugete(spatiu: str | None = None, an: int | None = None, luna: int | None = None) -> dict:
        user_id, _grant = _actor()
        db = SessionLocal()
        try:
            space, member = _resolve_space(db, user_id, spatiu)
            _require(member, "viewer")
            ensure_generated(db, space)
            today = today_bucharest()
            year = an or today.year
            month = luna or today.month
            rows = db.scalars(
                select(Budget).where(Budget.space_id == space.id, Budget.year == year, Budget.month == month)
            ).all()
            db.commit()
            payload = []
            for row in rows:
                consumed, remaining = budget_figures(db, space, row, start_day=_period_start_day(db, user_id))
                payload.append(
                    {
                        "id": str(row.id),
                        "categorie_id": str(row.category_id) if row.category_id else None,
                        "limita": fmt_amount(row.limit_amount),
                        "consumat": fmt_amount(consumed),
                        "ramas": fmt_amount(remaining),
                        "moneda": row.currency.strip(),
                        "an": row.year,
                        "luna": row.month,
                    }
                )
            return {"bugete": payload}
        finally:
            db.close()

    @mcp.tool(annotations=READ, structured_output=False)
    def obiective(spatiu: str | None = None) -> dict:
        user_id, _grant = _actor()
        db = SessionLocal()
        try:
            space, member = _resolve_space(db, user_id, spatiu)
            _require(member, "viewer")
            rows = db.scalars(select(Goal).where(Goal.space_id == space.id, Goal.archived_at.is_(None))).all()
            payload = []
            for row in rows:
                progress, remaining = goal_figures(db, space, row)
                payload.append(
                    {
                        "id": str(row.id),
                        "nume": row.name,
                        "tinta": fmt_amount(row.target_amount),
                        "progres": fmt_amount(progress),
                        "ramas": fmt_amount(remaining),
                        "moneda": row.currency.strip(),
                        "data": row.target_date.isoformat() if row.target_date else None,
                    }
                )
            return {"obiective": payload}
        finally:
            db.close()

    @mcp.tool(annotations=READ, structured_output=False)
    def raport_perioada(
        de_la: str,
        pana_la: str,
        spatiu: str | None = None,
        moneda: str | None = None,
    ) -> dict:
        user_id, _grant = _actor()
        db = SessionLocal()
        try:
            if spatiu:
                space, member = _resolve_space(db, user_id, spatiu)
                _require(member, "viewer")
                spaces = [space]
            else:
                spaces = [space for space, member in _memberships(db, user_id)]
            for space in sorted(spaces, key=lambda item: item.id):
                ensure_generated(db, space)
            db.commit()
            return build_report(
                db,
                spaces=spaces,
                start=date.fromisoformat(de_la),
                end=date.fromisoformat(pana_la),
                currency=moneda,
            )
        finally:
            db.close()

    @mcp.tool(annotations=READ, structured_output=False)
    def compara_perioade(
        de_la_a: str,
        pana_la_a: str,
        de_la_b: str,
        pana_la_b: str,
        spatiu: str | None = None,
    ) -> dict:
        user_id, _grant = _actor()
        db = SessionLocal()
        try:
            if spatiu:
                space, member = _resolve_space(db, user_id, spatiu)
                _require(member, "viewer")
                spaces = [space]
            else:
                spaces = [space for space, _member in _memberships(db, user_id)]
            for space in sorted(spaces, key=lambda item: item.id):
                ensure_generated(db, space)
            db.commit()
            return {
                "perioada_a": build_report(
                    db, spaces=spaces, start=date.fromisoformat(de_la_a), end=date.fromisoformat(pana_la_a), currency=None
                ),
                "perioada_b": build_report(
                    db, spaces=spaces, start=date.fromisoformat(de_la_b), end=date.fromisoformat(pana_la_b), currency=None
                ),
            }
        finally:
            db.close()

    @mcp.tool(annotations=ADD, structured_output=False)
    def adauga_tranzactie(
        fel: str,
        suma: str,
        cont: str,
        spatiu: str | None = None,
        categorie: str | None = None,
        cont_destinatie: str | None = None,
        suma_destinatie: str | None = None,
        moneda: str | None = None,
        data: str | None = None,
        descriere: str | None = None,
        obiectiv: str | None = None,
        curs: str | None = None,
        permite_duplicat: bool = False,
    ) -> dict:
        user_id, grant_id = _actor()
        payload = {
            "fel": fel,
            "suma": suma,
            "cont": cont,
            "spatiu": spatiu,
            "categorie": categorie,
            "cont_destinatie": cont_destinatie,
            "suma_destinatie": suma_destinatie,
            "moneda": moneda,
            "data": data,
            "descriere": descriere,
            "obiectiv": obiectiv,
            "curs": curs,
        }
        db = SessionLocal()
        fingerprint = idem.canonical_fingerprint(payload)
        row = None
        try:
            space, member = _resolve_space(db, user_id, spatiu)
            _require(member, "editor")
            if not permite_duplicat:
                row, existing = idem.begin(db, grant_id, fingerprint)
                if existing is not None:
                    return _tx_dict(existing)
            account = _resolve_named(_accounts(db, space.id), "contul", cont)
            if moneda and currency_code(moneda) != account.currency.strip():
                raise ToolError("Moneda nu corespunde contului.")
            category = None
            counter = None
            counter_amount = None
            if fel == "transfer":
                counter = _resolve_named(_accounts(db, space.id), "contul", cont_destinatie)
                if suma_destinatie:
                    counter_amount = parse_positive(suma_destinatie)
            elif fel in {"income", "expense"}:
                category = _resolve_named(_categories(db, space.id, fel), "categoria", categorie)
            else:
                raise ToolError("Tip de tranzacție invalid.")
            goal = None
            if obiectiv:
                goals = list(db.scalars(select(Goal).where(Goal.space_id == space.id, Goal.archived_at.is_(None))).all())
                goal = _resolve_named(goals, "obiectivul", obiectiv)
            tx = create_transaction(
                db,
                space=space,
                actor_id=user_id,
                kind=fel,
                amount=parse_positive(suma),
                account=account,
                category=category,
                counter_account=counter,
                counter_amount=counter_amount,
                occurred_on=date.fromisoformat(data) if data else today_bucharest(),
                description=descriere or "",
                goal=goal,
                fx_rate=parse_rate(curs) if curs else None,
                origin="asistent",
            )
            if row is not None:
                idem.complete(db, row, tx.id)
            else:
                db.commit()
            return _tx_dict(tx)
        except ToolError:
            if row is not None and not permite_duplicat:
                idem.abandon(db, grant_id, fingerprint)
            raise
        except AppError as exc:
            if row is not None and not permite_duplicat:
                idem.abandon(db, grant_id, fingerprint)
            raise ToolError(exc.detail) from exc
        except Exception as exc:
            if row is not None and not permite_duplicat:
                idem.abandon(db, grant_id, fingerprint)
            raise ToolError(str(exc)) from exc
        finally:
            db.close()

    @mcp.tool(annotations=DESTRUCTIVE, structured_output=False)
    def modifica_tranzactie(
        tranzactie_id: str,
        confirmat: bool = False,
        suma: str | None = None,
        descriere: str | None = None,
        data: str | None = None,
        cont: str | None = None,
        categorie: str | None = None,
        obiectiv: str | None = None,
        curs: str | None = None,
    ) -> dict:
        if confirmat is not True:
            raise ToolError("Modificarea cere confirmat=true, după o cerere explicită.")
        user_id, _grant = _actor()
        db = SessionLocal()
        try:
            tx = db.get(Transaction, uuid.UUID(tranzactie_id))
            if tx is None or tx.deleted_at is not None:
                raise ToolError("Tranzacția nu este disponibilă.")
            space, member = _resolve_space(db, user_id, str(tx.space_id))
            _require(member, "editor")
            changes: dict = {}
            if suma is not None:
                changes["amount"] = suma
            if descriere is not None:
                changes["description"] = descriere
            if data is not None:
                changes["occurred_on"] = date.fromisoformat(data)
            if cont is not None:
                changes["account_id"] = _resolve_named(_accounts(db, space.id), "contul", cont).id
            if categorie is not None:
                changes["category_id"] = _resolve_named(_categories(db, space.id, tx.kind), "categoria", categorie).id
            if obiectiv is not None:
                goals = list(db.scalars(select(Goal).where(Goal.space_id == space.id)).all())
                changes["goal_id"] = _resolve_named(goals, "obiectivul", obiectiv).id
            if curs is not None:
                changes["fx_rate"] = curs
            update_transaction(db, space=space, tx=tx, actor_id=user_id, data=changes)
            db.commit()
            return _tx_dict(tx)
        except AppError as exc:
            db.rollback()
            raise ToolError(exc.detail) from exc
        finally:
            db.close()

    @mcp.tool(annotations=DESTRUCTIVE, structured_output=False)
    def sterge_tranzactie(tranzactie_id: str, confirmat: bool = False) -> dict:
        if confirmat is not True:
            raise ToolError("Ștergerea cere confirmat=true, după o cerere explicită.")
        user_id, _grant = _actor()
        db = SessionLocal()
        try:
            tx = db.get(Transaction, uuid.UUID(tranzactie_id))
            if tx is None or tx.deleted_at is not None:
                raise ToolError("Tranzacția nu este disponibilă.")
            space, member = _resolve_space(db, user_id, str(tx.space_id))
            _require(member, "admin")
            soft_delete(db, space=space, tx=tx, user_id=user_id)
            db.commit()
            return _tx_dict(tx)
        except AppError as exc:
            db.rollback()
            raise ToolError(exc.detail) from exc
        finally:
            db.close()

    @mcp.tool(structured_output=False)
    def seteaza_buget(
        limita: str,
        an: int,
        luna: int,
        spatiu: str | None = None,
        moneda: str | None = None,
        categorie: str | None = None,
    ) -> dict:
        user_id, _grant = _actor()
        db = SessionLocal()
        try:
            space, member = _resolve_space(db, user_id, spatiu)
            _require(member, "admin")
            category = _resolve_named(_categories(db, space.id), "categoria", categorie) if categorie else None
            row = upsert_budget(
                db,
                space=space,
                category=category,
                year=an,
                month=luna,
                limit_amount=Decimal(limita),
                currency=moneda or space.base_currency.strip(),
            )
            db.commit()
            consumed, remaining = budget_figures(db, space, row, start_day=_period_start_day(db, user_id))
            return {
                "id": str(row.id),
                "limita": fmt_amount(row.limit_amount),
                "consumat": fmt_amount(consumed),
                "ramas": fmt_amount(remaining),
                "moneda": row.currency.strip(),
            }
        except AppError as exc:
            db.rollback()
            raise ToolError(exc.detail) from exc
        finally:
            db.close()

    @mcp.tool(structured_output=False)
    def adauga_categorie(nume: str, fel: str, spatiu: str | None = None, grup: str | None = None) -> dict:
        user_id, _grant = _actor()
        db = SessionLocal()
        try:
            space, member = _resolve_space(db, user_id, spatiu)
            _require(member, "admin")
            row = create_category(db, space, nume, fel, grup or "Altele")
            db.commit()
            return {"id": str(row.id), "nume": row.name, "fel": row.kind, "grup": row.group_name}
        except AppError as exc:
            db.rollback()
            raise ToolError(exc.detail) from exc
        finally:
            db.close()

    _ = User
