from __future__ import annotations

from app.models import Account, Budget, Category, Goal, Space, Transaction, User
from app.money import fmt_amount, fmt_percent, fmt_rate, q4


def iso(value) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def user_out(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "email_verified_at": iso(user.email_verified_at),
        "report_view": user.report_view,
        "period_start_day": user.period_start_day,
        "base_currency": user.base_currency.strip(),
        "created_at": iso(user.created_at),
    }


def space_out(space: Space, role: str | None = None) -> dict:
    payload = {
        "id": str(space.id),
        "name": space.name,
        "kind": space.kind,
        "base_currency": space.base_currency.strip(),
        "starts_on": iso(space.starts_on),
        "ends_on": iso(space.ends_on),
        "owner_id": str(space.owner_id),
        "archived_at": iso(space.archived_at),
        "created_at": iso(space.created_at),
    }
    if role is not None:
        payload["role"] = role
    return payload


def account_out(account: Account, balance: object | None = None) -> dict:
    payload = {
        "id": str(account.id),
        "space_id": str(account.space_id),
        "name": account.name,
        "kind": account.kind,
        "currency": account.currency.strip(),
        "opening_balance": fmt_amount(account.opening_balance),
        "opening_balance_date": iso(account.opening_balance_date),
        "archived_at": iso(account.archived_at),
        "created_at": iso(account.created_at),
    }
    if balance is not None:
        payload["balance"] = fmt_amount(balance)
    return payload


def category_out(category: Category) -> dict:
    return {
        "id": str(category.id),
        "space_id": str(category.space_id),
        "name": category.name,
        "kind": category.kind,
        "group_name": category.group_name,
        "archived_at": iso(category.archived_at),
        "created_at": iso(category.created_at),
    }


def transaction_out(tx: Transaction) -> dict:
    return {
        "id": str(tx.id),
        "space_id": str(tx.space_id),
        "account_id": str(tx.account_id),
        "counter_account_id": str(tx.counter_account_id) if tx.counter_account_id else None,
        "category_id": str(tx.category_id) if tx.category_id else None,
        "goal_id": str(tx.goal_id) if tx.goal_id else None,
        "recurring_rule_id": str(tx.recurring_rule_id) if tx.recurring_rule_id else None,
        "kind": tx.kind,
        "amount": fmt_amount(tx.amount),
        "currency": tx.currency.strip(),
        "counter_amount": fmt_amount(tx.counter_amount),
        "counter_currency": tx.counter_currency.strip() if tx.counter_currency else None,
        "fx_rate": fmt_rate(tx.fx_rate),
        "fx_rate_date": iso(tx.fx_rate_date),
        "fx_source": tx.fx_source,
        "occurred_on": iso(tx.occurred_on),
        "description": tx.description,
        "origin": tx.origin,
        "import_fingerprint": tx.import_fingerprint,
        "created_by": str(tx.created_by),
        "created_at": iso(tx.created_at),
        "updated_at": iso(tx.updated_at),
        "deleted_at": iso(tx.deleted_at),
    }


def budget_out(budget: Budget, consumed, remaining) -> dict:
    return {
        "id": str(budget.id),
        "space_id": str(budget.space_id),
        "category_id": str(budget.category_id) if budget.category_id else None,
        "year": budget.year,
        "month": budget.month,
        "limit_amount": fmt_amount(budget.limit_amount),
        "currency": budget.currency.strip(),
        "consumed": fmt_amount(consumed),
        "remaining": fmt_amount(remaining),
        "percent": fmt_percent(q4(consumed), q4(budget.limit_amount)),
        "created_at": iso(budget.created_at),
    }


def goal_out(goal: Goal, progress, remaining) -> dict:
    return {
        "id": str(goal.id),
        "space_id": str(goal.space_id),
        "name": goal.name,
        "target_amount": fmt_amount(goal.target_amount),
        "currency": goal.currency.strip(),
        "target_date": iso(goal.target_date),
        "account_id": str(goal.account_id) if goal.account_id else None,
        "archived_at": iso(goal.archived_at),
        "progress": fmt_amount(progress),
        "remaining": fmt_amount(remaining),
        "percent": fmt_percent(q4(progress), q4(goal.target_amount)),
        "created_at": iso(goal.created_at),
    }
