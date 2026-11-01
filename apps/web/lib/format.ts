export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function asList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const record = asRecord(data);
  const keys = [
    "items",
    "results",
    "data",
    "rows",
    "spaces",
    "accounts",
    "categories",
    "transactions",
    "budgets",
    "goals",
    "rules",
    "recurring_rules",
    "members",
    "grants",
    "connections",
    "balances",
  ];
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function monthStartIso(): string {
  return `${todayIso().slice(0, 8)}01`;
}

export function yearStartIso(): string {
  return `${todayIso().slice(0, 4)}-01-01`;
}

export function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function todayDisplay(): string {
  return formatDisplayDate(todayIso());
}

export function monthStartDisplay(): string {
  return formatDisplayDate(monthStartIso());
}

export function parseDisplayDate(value: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) throw new Error("Data trebuie să fie în formatul ZZ.LL.AAAA.");
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Data nu este validă.");
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return formatDisplayDate(iso) || iso;
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function currentYearMonth(): { year: number; month: number } {
  const iso = todayIso();
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

export function dec(value: unknown, fallback = "0"): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

export function decOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return dec(value);
}

export function formatMoney(amount: string | number | null | undefined, currency?: string | null): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const numeric = typeof amount === "number" ? amount : Number(String(amount).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(numeric)) return String(amount);
  const formatted = new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
  const code = (currency || "").trim().toUpperCase();
  const shown = code === "LEI" ? "RON" : code;
  return shown ? `${formatted} ${shown}` : formatted;
}

export function formatRate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(numeric);
}

export function fxCaption(rate: string | null, source: string | null, date: string | null): string | null {
  if (!rate && !source) return null;
  const parts: string[] = [];
  if (rate) parts.push(`curs ${formatRate(rate)}`);
  if (source === "frankfurter") parts.push("Frankfurter");
  else if (source === "manual") parts.push("manual");
  else if (source) parts.push(source);
  if (date) parts.push(formatDisplayDate(date));
  return parts.join(" · ");
}

export function plainAmount(value: string | number | null | undefined): string {
  const numeric = typeof value === "number" ? value : Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(numeric)) return "";
  const fixed = numeric.toFixed(2);
  return fixed.endsWith(".00") ? fixed.slice(0, -3) : fixed.replace(".", ",");
}

export function toAmount(input: string, options?: { allowZero?: boolean }): string {
  const cleaned = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(cleaned)) {
    throw new Error("Introdu o sumă cu cel mult 4 zecimale.");
  }
  const [whole, fraction = ""] = cleaned.split(".");
  const normalized = `${whole}.${(fraction + "00").slice(0, 2)}`;
  if (!options?.allowZero && /^0+(\.0+)?$/.test(normalized)) {
    throw new Error("Suma trebuie să fie mai mare decât zero.");
  }
  return normalized;
}

export function toRate(input: string): string {
  const cleaned = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,8})?$/.test(cleaned) || Number(cleaned) <= 0) {
    throw new Error("Cursul trebuie să fie un număr mai mare decât zero.");
  }
  return cleaned;
}

export function toCurrency(input: string): string {
  const code = input.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("Moneda are 3 litere, de exemplu RON.");
  return code === "LEI" ? "RON" : code;
}

export function safeNext(value: string | null | undefined, fallback = "/panou"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

export function percentOf(spent: string, limit: string, given?: unknown): number {
  if (typeof given === "number" && Number.isFinite(given)) return given;
  if (typeof given === "string" && given.trim() && Number.isFinite(Number(given))) return Number(given);
  const cap = Number(limit);
  const used = Number(spent);
  if (!Number.isFinite(cap) || cap <= 0 || !Number.isFinite(used)) return 0;
  return (used / cap) * 100;
}
