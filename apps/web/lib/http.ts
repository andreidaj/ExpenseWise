import { asRecord, asString } from "@/lib/format";

// Gol: browserul cheamă același site, iar Next trimite /api către API. Merge și de pe telefon.
// Un URL complet doar dacă API-ul stă pe alt domeniu.
const configured = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
export const API_URL = configured;

const ACCESS_KEY = "expensewise.access_token";
const REFRESH_KEY = "expensewise.refresh_token";
const MAIL_KEY = "expensewise.mail_hint";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export type MailHint = {
  email: string;
  emailSent: boolean | null;
  verificationToken: string | null;
  verificationUrl: string | null;
};

type Query = Record<string, string | string[] | null | undefined>;

type Options = {
  method?: string;
  json?: unknown;
  form?: FormData;
  query?: Query;
  auth?: boolean;
  skipRefresh?: boolean;
};

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function session(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

export function getAccess(): string | null {
  return storage()?.getItem(ACCESS_KEY) ?? null;
}

export function getRefresh(): string | null {
  return storage()?.getItem(REFRESH_KEY) ?? null;
}

export function saveTokens(tokens: { access: string; refresh: string | null }): void {
  const store = storage();
  if (!store) return;
  store.setItem(ACCESS_KEY, tokens.access);
  if (tokens.refresh) store.setItem(REFRESH_KEY, tokens.refresh);
}

export function clearTokens(): void {
  const store = storage();
  store?.removeItem(ACCESS_KEY);
  store?.removeItem(REFRESH_KEY);
}

export function readTokens(payload: unknown): { access: string; refresh: string | null } | null {
  const record = asRecord(payload);
  const nested = asRecord(record.tokens);
  const access = asString(record.access_token) || asString(record.access) || asString(nested.access_token);
  const refresh = asString(record.refresh_token) || asString(record.refresh) || asString(nested.refresh_token);
  if (!access) return null;
  return { access, refresh };
}

const TOKEN_KEYS = ["verification_token", "dev_verification_token", "verify_token", "email_token"];
const URL_KEYS = ["verification_url", "verify_url", "dev_verification_url"];

export function readDelivery(payload: unknown): Omit<MailHint, "email"> {
  const record = asRecord(payload);
  let emailSent: boolean | null = null;
  if (typeof record.email_sent === "boolean") emailSent = record.email_sent;
  else if (typeof record.mail_sent === "boolean") emailSent = record.mail_sent;
  else if (record.email_delivery === "sent" || record.delivery === "sent") emailSent = true;
  else if (
    record.email_delivery === "log" ||
    record.email_delivery === "logged" ||
    record.delivery === "log" ||
    record.delivery === "logged"
  ) {
    emailSent = false;
  }

  let verificationToken: string | null = null;
  for (const key of TOKEN_KEYS) {
    const value = asString(record[key]);
    if (value) {
      verificationToken = value;
      break;
    }
  }
  let verificationUrl: string | null = null;
  for (const key of URL_KEYS) {
    const value = asString(record[key]);
    if (value) {
      verificationUrl = value;
      break;
    }
  }
  return { emailSent, verificationToken, verificationUrl };
}

export function saveMailHint(hint: MailHint): void {
  session()?.setItem(MAIL_KEY, JSON.stringify(hint));
}

export function loadMailHint(): MailHint | null {
  const raw = session()?.getItem(MAIL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MailHint;
    if (!parsed || typeof parsed.email !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearMailHint(): void {
  session()?.removeItem(MAIL_KEY);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (typeof error.body === "string" && error.body.trim()) return error.body;
    const record = asRecord(error.body);
    const detail = record.detail ?? record.message;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      const parts = detail
        .map((item) => {
          const row = asRecord(item);
          const message = asString(row.msg) || asString(row.message);
          if (!message) return null;
          const loc = Array.isArray(row.loc)
            ? row.loc.filter((part) => part !== "body" && part !== "query").join(".")
            : "";
          return loc ? `${loc}: ${message}` : message;
        })
        .filter((part): part is string => Boolean(part));
      if (parts.length) return parts.join(" ");
    }
    if (error.status === 401) return "Sesiunea a expirat. Intră din nou în cont.";
    if (error.status === 403) return "Nu ai voie să faci această acțiune.";
    if (error.status === 404) return "Nu am găsit resursa.";
    if (error.status === 410) return "Cererea a expirat.";
    if (error.status === 503) return "Serviciul nu este disponibil.";
    return `Eroare ${error.status}.`;
  }
  if (error instanceof Error && error.message) return error.message;
  return "A apărut o eroare.";
}

export function readMessage(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  return asString(record.message) || asString(record.detail) || fallback;
}

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else params.set(key, value);
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refresh = getRefresh();
  if (!refresh) return false;
  try {
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${refresh}`,
      },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!response.ok) return false;
    const tokens = readTokens(await response.json());
    if (!tokens) return false;
    saveTokens(tokens);
    return true;
  } catch {
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

function notifyUnauthorized(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("expensewise-unauthorized"));
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function api<T = unknown>(path: string, options: Options = {}, retried = false): Promise<T> {
  const headers = new Headers();
  if (options.auth !== false) {
    const access = getAccess();
    if (access) headers.set("Authorization", `Bearer ${access}`);
  }
  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }

  const response = await fetch(`${API_URL}${withQuery(path, options.query)}`, {
    method: options.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  });

  if (response.status === 401 && options.auth !== false && !options.skipRefresh && !retried) {
    const refreshed = await refreshOnce();
    if (refreshed) return api<T>(path, options, true);
    clearTokens();
    notifyUnauthorized();
  }

  const payload = await parseBody(response);
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  const access = getAccess();
  if (access) headers.set("Authorization", `Bearer ${access}`);
  let response = await fetch(`${API_URL}${path}`, { headers });
  if (response.status === 401) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      const nextHeaders = new Headers();
      const nextAccess = getAccess();
      if (nextAccess) nextHeaders.set("Authorization", `Bearer ${nextAccess}`);
      response = await fetch(`${API_URL}${path}`, { headers: nextHeaders });
    } else {
      clearTokens();
      notifyUnauthorized();
    }
  }
  if (!response.ok) throw new ApiError(response.status, await parseBody(response));
  return response.blob();
}
