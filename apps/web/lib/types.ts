export type Role = "owner" | "admin" | "editor" | "viewer";
export type SpaceKind = "personal" | "family" | "project";
export type AccountKind = "cash" | "bank" | "card" | "savings";
export type TxKind = "income" | "expense" | "transfer" | "debt" | "repayment";
export type ReportView = "separate" | "consolidated" | "both";
export type Frequency = "weekly" | "monthly" | "yearly";

export type User = {
  id: string;
  email: string;
  display_name: string;
  email_verified_at: string | null;
  report_view: ReportView;
  period_start_day: number;
  base_currency: string;
};

export type Space = {
  id: string;
  owner_id?: string;
  name: string;
  kind: SpaceKind;
  base_currency: string;
  starts_on: string | null;
  ends_on: string | null;
  archived_at: string | null;
  role: Role;
};

export type Member = {
  user_id: string;
  email: string;
  display_name: string;
  role: Role;
};

export type Account = {
  id: string;
  space_id: string;
  name: string;
  kind: AccountKind;
  currency: string;
  opening_balance: string;
  opening_balance_date: string;
  archived_at: string | null;
  balance: string | null;
};

export type Category = {
  id: string;
  space_id: string;
  name: string;
  kind: "income" | "expense";
  group_name: string;
  archived_at: string | null;
};

export type Transaction = {
  id: string;
  space_id: string;
  account_id: string;
  counter_account_id: string | null;
  category_id: string | null;
  goal_id: string | null;
  kind: TxKind;
  amount: string;
  currency: string;
  counter_amount: string | null;
  counter_currency: string | null;
  fx_rate: string | null;
  fx_rate_date: string | null;
  fx_source: string | null;
  occurred_on: string;
  description: string;
  origin: string;
  account_name?: string | null;
  counter_account_name?: string | null;
  category_name?: string | null;
};

export type RecurringRule = {
  id: string;
  space_id: string;
  account_id: string;
  category_id: string;
  kind: "income" | "expense";
  amount: string;
  currency: string;
  description: string;
  frequency: Frequency;
  next_run_on: string;
  ends_on: string | null;
  paused_at: string | null;
};

export type Budget = {
  id: string;
  space_id: string;
  category_id: string | null;
  category_name: string | null;
  year: number;
  month: number;
  limit_amount: string;
  currency: string;
  spent: string;
  remaining: string;
  percent: number;
};

export type Goal = {
  id: string;
  space_id: string;
  name: string;
  target_amount: string;
  currency: string;
  target_date: string | null;
  account_id: string | null;
  progress: string;
  percent: number;
  archived_at: string | null;
};

export type CurrencyTotal = {
  currency: string;
  income: string;
  expense: string;
  incomeRon: string | null;
  expenseRon: string | null;
  fxRate: string | null;
  fxDate: string | null;
  fxSource: string | null;
  missingFx: boolean;
};

export type CategoryTotal = {
  name: string;
  kind: string;
  currency: string;
  amount: string;
  amountRon: string | null;
};

export type SeriesPoint = {
  date: string;
  income: number;
  expense: number;
};

export type ReportModel = {
  byCurrency: CurrencyTotal[];
  consolidated: { income: string; expense: string; missingFx: number } | null;
  categories: CategoryTotal[];
  series: SeriesPoint[];
};

export type MailHint = {
  email: string;
  emailSent: boolean | null;
  verificationToken: string | null;
  verificationUrl: string | null;
};

export type AssistantGrant = {
  id: string;
  client_id: string;
  client_name: string;
  created_at: string | null;
  last_used_at: string | null;
};

export type ImportSimilar = {
  id: string;
  occurred_on: string;
  amount: string;
  currency: string;
  description: string;
  kind: string;
};

export type ImportPreviewRow = {
  id: string;
  row_number: number;
  raw: Record<string, unknown>;
  mapped: Record<string, unknown>;
  duplicate_of: string | null;
  duplicate: boolean;
  similar: ImportSimilar | null;
  outside: boolean;
  error: string | null;
  status: string;
};

export type DebtRepayment = {
  id: string;
  amount: string;
  account_id: string;
  occurred_on: string;
};

export type Debt = {
  id: string;
  person_name: string;
  amount: string;
  remaining: string;
  currency: string;
  account_id: string;
  account_name: string;
  occurred_on: string;
  note: string;
  closed_at: string | null;
  repayments: DebtRepayment[];
};

export type ImportPreview = {
  id: string;
  filename: string;
  rows: ImportPreviewRow[];
};

export type ReceiptDraft = {
  id: string;
  merchant: string;
  occurred_on: string | null;
  total_amount: string;
  currency: string;
  lines: ReceiptLine[];
  status: string;
};

export type ReceiptLine = {
  description: string;
  amount: string;
};

export const CURRENCIES = ["RON", "EUR", "USD", "GBP", "CHF", "HUF", "BGN", "MDL"];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Proprietar",
  admin: "Administrator",
  editor: "Editor",
  viewer: "Vizualizare",
};

export const SPACE_KIND_LABEL: Record<SpaceKind, string> = {
  personal: "Personal",
  family: "Familie",
  project: "Proiect",
};

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  cash: "Numerar",
  bank: "Bancă",
  card: "Card",
  savings: "Economii",
};

export const TX_KIND_LABEL: Record<TxKind, string> = {
  income: "Venit",
  expense: "Cheltuială",
  transfer: "Transfer",
  debt: "Datorie",
  repayment: "Înapoi",
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Săptămânal",
  monthly: "Lunar",
  yearly: "Anual",
};

export const REPORT_VIEW_LABEL: Record<ReportView, string> = {
  separate: "Individual",
  consolidated: "Consolidat",
  both: "Ambele",
};
