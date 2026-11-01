import { todayIso } from "@/lib/format";

export type IsoPeriod = { from: string; to: string };

const STORAGE_KEY = "ew-period";

export function periodStartDay(value: unknown): number {
  const day = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 31) return 1;
  return day;
}

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function lastDay(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function clampDay(y: number, m: number, day: number): number {
  return Math.min(Math.max(day, 1), lastDay(y, m));
}

function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const index = y * 12 + (m - 1) + delta;
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

function addDays(value: string, delta: number): string {
  const { y, m, d } = parts(value);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function cycleStart(y: number, m: number, startDay: number): string {
  return iso(y, m, clampDay(y, m, startDay));
}

export function closedCycle(y: number, m: number, startDay: number): IsoPeriod {
  const from = cycleStart(y, m, startDay);
  const next = addMonths(y, m, 1);
  return { from, to: addDays(cycleStart(next.y, next.m, startDay), -1) };
}

export function cycleOf(dayIso: string, startDay: number): { y: number; m: number } {
  const { y, m, d } = parts(dayIso);
  const start = clampDay(y, m, startDay);
  if (d >= start) return { y, m };
  return addMonths(y, m, -1);
}

export function currentPeriod(today: string, startDay: number): IsoPeriod {
  const cycle = cycleOf(today, startDay);
  return { from: cycleStart(cycle.y, cycle.m, startDay), to: today };
}

export function shiftPeriod(period: IsoPeriod, direction: -1 | 1, startDay: number, today: string): IsoPeriod | null {
  const anchor = direction === -1 ? period.from : period.to;
  const cycle = cycleOf(anchor, startDay);
  const moved = addMonths(cycle.y, cycle.m, direction);
  const closed = closedCycle(moved.y, moved.m, startDay);
  if (direction === -1) {
    if (closed.from < "2000-01-01") return null;
    return closed;
  }
  if (closed.from > today) return null;
  if (today >= closed.from && today <= closed.to) return { from: closed.from, to: today };
  return closed;
}

export function periodYearMonth(from: string): { year: number; month: number } {
  const { y, m } = parts(from);
  return { year: y, month: m };
}

export function readStoredPeriod(startDay: number): IsoPeriod {
  const today = todayIso();
  const fallback = currentPeriod(today, startDay);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { startDay?: unknown; from?: unknown; to?: unknown };
    if (periodStartDay(parsed.startDay) !== startDay) return fallback;
    if (!isIso(parsed.from) || !isIso(parsed.to)) return fallback;
    if (parsed.from > parsed.to || parsed.to > today) return fallback;
    return { from: parsed.from, to: parsed.to };
  } catch {
    return fallback;
  }
}

export function writeStoredPeriod(startDay: number, period: IsoPeriod): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ startDay, from: period.from, to: period.to }));
}

export function clearStoredPeriod(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
