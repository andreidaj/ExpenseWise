from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CHAR, Date, DateTime, ForeignKey, Integer, Numeric, SmallInteger, Text, Uuid, text
from sqlalchemy.dialects.postgresql import CITEXT, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(CITEXT, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(Text)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    report_view: Mapped[str] = mapped_column(Text, default="both")
    period_start_day: Mapped[int] = mapped_column(SmallInteger, default=1)
    base_currency: Mapped[str] = mapped_column(CHAR(3), default="RON")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class EmailToken(Base):
    __tablename__ = "email_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    purpose: Mapped[str] = mapped_column(Text)
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Space(Base):
    __tablename__ = "spaces"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(Text)
    base_currency: Mapped[str] = mapped_column(CHAR(3), default="RON")
    starts_on: Mapped[date | None] = mapped_column(Date)
    ends_on: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SpaceMember(Base):
    __tablename__ = "space_members"

    space_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SpaceInvitation(Base):
    __tablename__ = "space_invitations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    space_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"))
    email: Mapped[str] = mapped_column(CITEXT)
    role: Mapped[str] = mapped_column(Text)
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    invited_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    space_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(Text)
    currency: Mapped[str] = mapped_column(CHAR(3))
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(19, 4), default=Decimal("0"))
    opening_balance_date: Mapped[date] = mapped_column(Date)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    space_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(Text)
    group_name: Mapped[str] = mapped_column(Text)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    space_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"))
    account_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("accounts.id"))
    counter_account_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("accounts.id"))
    category_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("categories.id"))
    goal_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True))
    recurring_rule_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True))
    kind: Mapped[str] = mapped_column(Text)
    amount: Mapped[Decimal] = mapped_column(Numeric(19, 4))
    currency: Mapped[str] = mapped_column(CHAR(3))
    counter_amount: Mapped[Decimal | None] = mapped_column(Numeric(19, 4))
    counter_currency: Mapped[str | None] = mapped_column(CHAR(3))
    fx_rate: Mapped[Decimal | None] = mapped_column(Numeric(19, 8))
    fx_rate_date: Mapped[date | None] = mapped_column(Date)
    fx_source: Mapped[str | None] = mapped_column(Text)
    occurred_on: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(Text, default="")
    origin: Mapped[str] = mapped_column(Text, default="app")
    import_fingerprint: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    space_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("spaces.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True))
    detail: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RecurringRule(Base):
    __tablename__ = "recurring_rules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    space_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"))
    account_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("accounts.id"))
    category_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("categories.id"))
    kind: Mapped[str] = mapped_column(Text)
    amount: Mapped[Decimal] = mapped_column(Numeric(19, 4))
    currency: Mapped[str] = mapped_column(CHAR(3))
    description: Mapped[str] = mapped_column(Text, default="")
    frequency: Mapped[str] = mapped_column(Text)
    next_run_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date | None] = mapped_column(Date)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    space_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"))
    category_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("categories.id"))
    year: Mapped[int] = mapped_column(SmallInteger)
    month: Mapped[int] = mapped_column(SmallInteger)
    limit_amount: Mapped[Decimal] = mapped_column(Numeric(19, 4))
    currency: Mapped[str] = mapped_column(CHAR(3))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    space_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    target_amount: Mapped[Decimal] = mapped_column(Numeric(19, 4))
    currency: Mapped[str] = mapped_column(CHAR(3))
    target_date: Mapped[date | None] = mapped_column(Date)
    account_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("accounts.id"))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    base_currency: Mapped[str] = mapped_column(CHAR(3))
    quote_currency: Mapped[str] = mapped_column(CHAR(3))
    rate_date: Mapped[date] = mapped_column(Date)
    rate: Mapped[Decimal] = mapped_column(Numeric(19, 8))
    source: Mapped[str] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    space_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ImportRow(Base):
    __tablename__ = "import_rows"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    batch_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("import_batches.id", ondelete="CASCADE"))
    row_number: Mapped[int] = mapped_column(Integer)
    raw: Mapped[dict] = mapped_column(JSONB)
    mapped: Mapped[dict | None] = mapped_column(JSONB)
    duplicate_of: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("transactions.id"))
    status: Mapped[str] = mapped_column(Text, default="pending")


class ReceiptDraft(Base):
    __tablename__ = "receipt_drafts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    space_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"))
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    merchant: Mapped[str | None] = mapped_column(Text)
    occurred_on: Mapped[date | None] = mapped_column(Date)
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(19, 4))
    currency: Mapped[str | None] = mapped_column(CHAR(3))
    lines: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(Text, default="pending_review")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AssistantOAuthClient(Base):
    __tablename__ = "assistant_oauth_clients"

    client_id: Mapped[str] = mapped_column(Text, primary_key=True)
    client_info: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AssistantAuthRequest(Base):
    __tablename__ = "assistant_auth_requests"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    client_id: Mapped[str] = mapped_column(Text, ForeignKey("assistant_oauth_clients.client_id"))
    params: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AssistantGrant(Base):
    __tablename__ = "assistant_grants"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    client_id: Mapped[str] = mapped_column(Text, ForeignKey("assistant_oauth_clients.client_id"))
    client_name: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AssistantAuthCode(Base):
    __tablename__ = "assistant_auth_codes"

    code_hash: Mapped[str] = mapped_column(Text, primary_key=True)
    grant_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("assistant_grants.id", ondelete="CASCADE"))
    client_id: Mapped[str] = mapped_column(Text)
    code_challenge: Mapped[str] = mapped_column(Text)
    redirect_uri: Mapped[str] = mapped_column(Text)
    redirect_uri_provided_explicitly: Mapped[bool] = mapped_column(default=True)
    resource: Mapped[str | None] = mapped_column(Text)
    scopes: Mapped[str] = mapped_column(Text, default="")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AssistantToken(Base):
    __tablename__ = "assistant_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    kind: Mapped[str] = mapped_column(Text)
    grant_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("assistant_grants.id", ondelete="CASCADE"))
    client_id: Mapped[str] = mapped_column(Text)
    scopes: Mapped[str] = mapped_column(Text, default="")
    resource: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AssistantIdempotency(Base):
    __tablename__ = "assistant_idempotency"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    grant_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("assistant_grants.id", ondelete="CASCADE"))
    fingerprint: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("transactions.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


# Keep the SQL text import used by migrations out of runtime queries.
_ = text
