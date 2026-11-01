import { asRecord, asString, dec, decOrNull, percentOf } from "@/lib/format";
import { periodStartDay } from "@/lib/period";
import type {
  Account,
  AccountKind,
  AssistantGrant,
  Budget,
  Category,
  CategoryTotal,
  CurrencyTotal,
  Frequency,
  Goal,
  ImportPreview,
  ImportPreviewRow,
  Member,
  ReceiptDraft,
  ReceiptLine,
  RecurringRule,
  ReportModel,
  ReportView,
  Role,
  SeriesPoint,
  Space,
  SpaceKind,
  Transaction,
  TxKind,
  User,
} from "@/lib/types";

const ROLES: Role[] = ["owner", "admin", "editor", "viewer"];
const SPACE_KINDS: SpaceKind[] = ["personal", "family", "project"];
const ACCOUNT_KINDS: AccountKind[] = ["cash", "bank", "card", "savings"];
const TX_KINDS: TxKind[] = ["income", "expense", "transfer"];
const FREQUENCIES: Frequency[] = ["weekly", "monthly", "yearly"];
const VIEWS: ReportView[] = ["separate", "consolidated", "both"];

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function normalizeUser(raw: unknown): User {
  const record = asRecord(raw);
  const nested = asRecord(record.user);
  const source = record.email || record.display_name ? record : nested;
  const verifiedFlag = source.email_verified === true || source.is_verified === true;
  let verified: string | null = null;
  if (source.email_verified_at) verified = asString(source.email_verified_at);
  else if (verifiedFlag) verified = new Date().toISOString();
  return {
    id: asString(source.id) || "",
    email: asString(source.email) || "",
    display_name: asString(source.display_name) || asString(source.name) || "",
    email_verified_at: verified,
    report_view: oneOf(asString(source.report_view), VIEWS, "both"),
    period_start_day: periodStartDay(source.period_start_day),
    base_currency: (asString(source.base_currency) || "RON").toUpperCase(),
  };
}

export function normalizeSpace(raw: unknown): Space | null {
  const record = asRecord(raw);
  const id = asString(record.id);
  if (!id) return null;
  const membership = asRecord(record.membership);
  const role = oneOf(asString(record.role) || asString(record.my_role) || asString(membership.role), ROLES, "viewer");
  return {
    id,
    owner_id: asString(record.owner_id) || undefined,
    name: asString(record.name) || "Spațiu",
    kind: oneOf(asString(record.kind), SPACE_KINDS, "personal"),
    base_currency: (asString(record.base_currency) || "RON").toUpperCase(),
    starts_on: asString(record.starts_on),
    ends_on: asString(record.ends_on),
    archived_at: asString(record.archived_at),
    role,
  };
}

export function normalizeMember(raw: unknown): Member | null {
  const record = asRecord(raw);
  const user = asRecord(record.user);
  const userId = asString(record.user_id) || asString(user.id) || asString(record.id);
  if (!userId) return null;
  return {
    user_id: userId,
    email: asString(record.email) || asString(user.email) || "",
    display_name: asString(record.display_name) || asString(user.display_name) || asString(record.name) || "",
    role: oneOf(asString(record.role), ROLES, "viewer"),
  };
}

export function normalizeAccount(raw: unknown): Account | null {
  const record = asRecord(raw);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    space_id: asString(record.space_id) || "",
    name: asString(record.name) || "Cont",
    kind: oneOf(asString(record.kind), ACCOUNT_KINDS, "cash"),
    currency: (asString(record.currency) || "RON").toUpperCase(),
    opening_balance: dec(record.opening_balance),
    opening_balance_date: asString(record.opening_balance_date) || "",
    archived_at: asString(record.archived_at),
    balance: decOrNull(record.balance),
  };
}

export function normalizeCategory(raw: unknown): Category | null {
  const record = asRecord(raw);
  const id = asString(record.id);
  if (!id) return null;
  const kind = asString(record.kind) === "income" ? "income" : "expense";
  return {
    id,
    space_id: asString(record.space_id) || "",
    name: asString(record.name) || "Categorie",
    kind,
    group_name: asString(record.group_name) || "Altele",
    archived_at: asString(record.archived_at),
  };
}

export function normalizeTransaction(raw: unknown): Transaction | null {
  const record = asRecord(raw);
  const id = asString(record.id);
  if (!id) return null;
  const account = asRecord(record.account);
  const counter = asRecord(record.counter_account);
  const category = asRecord(record.category);
  return {
    id,
    space_id: asString(record.space_id) || "",
    account_id: asString(record.account_id) || asString(account.id) || "",
    counter_account_id: asString(record.counter_account_id) || asString(counter.id),
    category_id: asString(record.category_id) || asString(category.id),
    goal_id: asString(record.goal_id),
    kind: oneOf(asString(record.kind), TX_KINDS, "expense"),
    amount: dec(record.amount),
    currency: (asString(record.currency) || "RON").toUpperCase(),
    counter_amount: decOrNull(record.counter_amount),
    counter_currency: asString(record.counter_currency)?.toUpperCase() || null,
    fx_rate: asString(record.fx_rate),
    fx_rate_date: asString(record.fx_rate_date),
    fx_source: asString(record.fx_source),
    occurred_on: asString(record.occurred_on) || "",
    description: asString(record.description) || "",
    origin: asString(record.origin) || "app",
    account_name: asString(record.account_name) || asString(account.name),
    counter_account_name: asString(record.counter_account_name) || asString(counter.name),
    category_name: asString(record.category_name) || asString(category.name),
  };
}

export function normalizeRecurring(raw: unknown): RecurringRule | null {
  const record = asRecord(raw);
  const id = asString(record.id);
  if (!id) return null;
  const kind = asString(record.kind) === "income" ? "income" : "expense";
  return {
    id,
    space_id: asString(record.space_id) || "",
    account_id: asString(record.account_id) || "",
    category_id: asString(record.category_id) || "",
    kind,
    amount: dec(record.amount),
    currency: (asString(record.currency) || "RON").toUpperCase(),
    description: asString(record.description) || "",
    frequency: oneOf(asString(record.frequency), FREQUENCIES, "monthly"),
    next_run_on: asString(record.next_run_on) || "",
    ends_on: asString(record.ends_on),
    paused_at: asString(record.paused_at),
  };
}

export function normalizeBudget(raw: unknown): Budget | null {
  const record = asRecord(raw);
  const id = asString(record.id);
  if (!id) return null;
  const category = asRecord(record.category);
  const limit = dec(record.limit_amount ?? record.limit);
  const spent = dec(record.spent ?? record.consumed ?? record.consumat ?? record.used);
  const remaining = decOrNull(record.remaining ?? record.left ?? record.ramas) ?? String(Number(limit) - Number(spent));
  return {
    id,
    space_id: asString(record.space_id) || "",
    category_id: asString(record.category_id) || asString(category.id),
    category_name: asString(record.category_name) || asString(category.name),
    year: Number(record.year) || 0,
    month: Number(record.month) || 0,
    limit_amount: limit,
    currency: (asString(record.currency) || "RON").toUpperCase(),
    spent,
    remaining,
    percent: percentOf(spent, limit, record.percent ?? record.percentage),
  };
}

export function normalizeGoal(raw: unknown): Goal | null {
  const record = asRecord(raw);
  const id = asString(record.id);
  if (!id) return null;
  const target = dec(record.target_amount ?? record.target);
  const progress = dec(record.progress ?? record.progress_amount ?? record.saved);
  return {
    id,
    space_id: asString(record.space_id) || "",
    name: asString(record.name) || "Obiectiv",
    target_amount: target,
    currency: (asString(record.currency) || "RON").toUpperCase(),
    target_date: asString(record.target_date),
    account_id: asString(record.account_id),
    progress,
    percent: percentOf(progress, target, record.percent ?? record.percentage),
    archived_at: asString(record.archived_at),
  };
}

function normalizeCurrencyRow(raw: unknown): CurrencyTotal | null {
  const record = asRecord(raw);
  const currency = (asString(record.currency) || asString(record.code) || "").toUpperCase();
  if (!currency) return null;
  return {
    currency,
    income: dec(record.income ?? record.venit ?? record.total_income),
    expense: dec(record.expense ?? record.cheltuieli ?? record.total_expense),
    incomeRon: decOrNull(record.income_ron ?? record.income_in_base ?? record.income_base),
    expenseRon: decOrNull(record.expense_ron ?? record.expense_in_base ?? record.expense_base),
    fxRate: asString(record.fx_rate ?? record.rate ?? record.curs),
    fxDate: asString(record.fx_rate_date ?? record.rate_date),
    fxSource: asString(record.fx_source ?? record.source ?? record.sursa),
    missingFx: Boolean(record.missing_fx || record.missingFx || record.fx_missing),
  };
}

function normalizeCategoryTotal(raw: unknown): CategoryTotal | null {
  const record = asRecord(raw);
  const category = asRecord(record.category);
  const name = asString(record.category_name) || asString(record.name) || asString(category.name) || asString(record.label);
  if (!name) return null;
  return {
    name,
    kind: asString(record.kind) || "expense",
    currency: (asString(record.currency) || "RON").toUpperCase(),
    amount: dec(record.amount ?? record.total ?? record.expense),
    amountRon: decOrNull(record.amount_ron ?? record.amount_in_base ?? record.total_ron),
  };
}

function normalizeSeries(raw: unknown): SeriesPoint | null {
  const record = asRecord(raw);
  const date = asString(record.date) || asString(record.occurred_on) || asString(record.day);
  if (!date) return null;
  return {
    date,
    income: Number(record.income ?? record.venit ?? 0) || 0,
    expense: Number(record.expense ?? record.cheltuieli ?? record.amount ?? 0) || 0,
  };
}

export function normalizeReport(raw: unknown): ReportModel {
  const record = asRecord(raw);
  const currencySource =
    record.by_currency ?? record.currencies ?? record.totals_by_currency ?? record.totals ?? record.per_currency;
  const categorySource = record.by_category ?? record.categories ?? record.category_totals;
  const seriesSource = record.series ?? record.by_day ?? record.daily ?? record.points;
  const consolidatedRecord = asRecord(record.consolidated ?? record.consolidated_ron ?? record.total_ron);
  let missingFx = Number(consolidatedRecord.missing_fx_count ?? consolidatedRecord.missing_fx ?? record.missing_fx_count ?? 0) || 0;
  if (Array.isArray(record.missing_fx)) missingFx = Math.max(missingFx, record.missing_fx.length);
  const hasConsolidated = Object.keys(consolidatedRecord).length > 0;
  return {
    byCurrency: Array.isArray(currencySource)
      ? currencySource.map(normalizeCurrencyRow).filter((row): row is CurrencyTotal => Boolean(row))
      : [],
    consolidated: hasConsolidated
      ? {
          income: dec(consolidatedRecord.income ?? consolidatedRecord.venit),
          expense: dec(consolidatedRecord.expense ?? consolidatedRecord.cheltuieli),
          missingFx,
        }
      : null,
    categories: Array.isArray(categorySource)
      ? categorySource.map(normalizeCategoryTotal).filter((row): row is CategoryTotal => Boolean(row))
      : [],
    series: Array.isArray(seriesSource)
      ? seriesSource.map(normalizeSeries).filter((row): row is SeriesPoint => Boolean(row))
      : [],
  };
}

export function normalizeGrant(raw: unknown): AssistantGrant | null {
  const record = asRecord(raw);
  const id = asString(record.id) || asString(record.grant_id);
  if (!id) return null;
  return {
    id,
    client_id: asString(record.client_id) || "",
    client_name: asString(record.client_name) || asString(record.name) || "Asistent",
    created_at: asString(record.created_at),
    last_used_at: asString(record.last_used_at),
  };
}

export function normalizeConsent(raw: unknown): { clientName: string; email: string } {
  const record = asRecord(raw);
  const client = asRecord(record.client);
  return {
    clientName:
      asString(record.client_name) ||
      asString(record.application_name) ||
      asString(client.client_name) ||
      asString(record.name) ||
      "Aplicație",
    email: asString(record.email) || asString(record.user_email) || "",
  };
}

function mappedRecord(value: unknown): Record<string, unknown> {
  return asRecord(value);
}

export function normalizeImportPreview(raw: unknown): ImportPreview {
  const record = asRecord(raw);
  const batch = asRecord(record.batch);
  const id = asString(record.id) || asString(record.batch_id) || asString(batch.id) || "";
  const rowsSource = Array.isArray(record.rows) ? record.rows : Array.isArray(record.import_rows) ? record.import_rows : [];
  const rows: ImportPreviewRow[] = rowsSource.map((item, index) => {
    const row = asRecord(item);
    return {
      id: asString(row.id) || String(index + 1),
      row_number: Number(row.row_number) || index + 1,
      raw: mappedRecord(row.raw),
      mapped: mappedRecord(row.mapped),
      duplicate_of: asString(row.duplicate_of),
      status: asString(row.status) || "pending",
    };
  });
  return {
    id,
    filename: asString(record.filename) || asString(batch.filename) || "",
    rows,
  };
}

export function normalizeReceipt(raw: unknown): ReceiptDraft {
  const record = asRecord(raw);
  const draft = record.merchant || record.total_amount || record.id ? record : asRecord(record.draft);
  const linesRaw = Array.isArray(draft.lines) ? draft.lines : [];
  const lines: ReceiptLine[] = linesRaw.map((item) => {
    const line = asRecord(item);
    return {
      description: asString(line.description) || asString(line.name) || asString(line.text) || "",
      amount: dec(line.amount ?? line.total ?? "0"),
    };
  });
  return {
    id: asString(draft.id) || "",
    merchant: asString(draft.merchant) || "",
    occurred_on: asString(draft.occurred_on),
    total_amount: dec(draft.total_amount ?? draft.total ?? "0"),
    currency: (asString(draft.currency) || "RON").toUpperCase(),
    lines,
    status: asString(draft.status) || "pending_review",
  };
}

export function mappedText(mapped: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = asString(mapped[key]);
    if (value) return value;
  }
  return "";
}
