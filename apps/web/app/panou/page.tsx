"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Guard } from "@/components/Guard";
import { MoneySummary } from "@/components/MoneySummary";
import { PeriodBar } from "@/components/PeriodBar";
import { SpaceBody } from "@/components/SpaceBody";
import { Alert, PageHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate, formatMoney, fxCaption } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { canManage } from "@/lib/permissions";
import { readStoredPeriod, writeStoredPeriod, type IsoPeriod } from "@/lib/period";
import { resources } from "@/lib/resources";
import type { Account, ReportModel, Transaction } from "@/lib/types";
import { TX_KIND_LABEL } from "@/lib/types";

const screenCss = `
.ew-screen{width:100%;max-width:100%;min-width:0;overflow-x:hidden;display:grid;gap:16px;background:transparent;color:#F8FAFC}
.ew-screen h1,.ew-screen h2,.ew-screen h3,.ew-screen .money-figure,.ew-screen .ew-figure{font-family:inherit;color:#F8FAFC}
.ew-screen h1{font-size:1.7rem;line-height:1.15;overflow-wrap:anywhere}
.ew-screen h2{font-size:1.05rem;line-height:1.3;overflow-wrap:anywhere}
.ew-screen .muted,.ew-screen .page-lede,.ew-screen .fx,.ew-screen .field span,.ew-screen .empty{color:#98A4BA}
.ew-screen a{color:#9585FF}
.ew-screen .page-head{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:12px;width:100%;max-width:100%}
.ew-screen .page-head>.stack{min-width:0;width:100%}
.ew-screen .page-lede{max-width:100%}
.ew-screen .page-action{width:100%}
.ew-screen .page-action>.btn,.ew-screen .page-action>a{width:100%;min-height:44px}
@media (min-width:840px){
  .ew-screen .page-head{flex-direction:row;flex-wrap:wrap;align-items:flex-end;justify-content:space-between}
  .ew-screen .page-head>.stack{width:auto;flex:1 1 16rem}
  .ew-screen .page-action{width:auto;flex:0 0 auto}
  .ew-screen .page-action>.btn,.ew-screen .page-action>a{width:auto}
}
.ew-screen .card,.ew-screen .money,.ew-screen .ew-hero,.ew-screen .ew-row,.ew-screen .ew-empty{
  background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:20px;box-shadow:none;color:#F8FAFC;max-width:100%;min-width:0
}
.ew-screen .btn,.ew-screen .segment button{min-height:44px;font-family:inherit}
.ew-screen .btn.primary,.ew-screen .btn.primary:hover{background:#9585FF;border-color:#9585FF;color:#0B0F19}
.ew-screen .btn.ghost,.ew-screen .btn.ghost:hover{background:transparent;color:#F8FAFC;border-color:rgba(255,255,255,0.07)}
.ew-screen .segment{display:flex;flex-wrap:wrap;width:100%;max-width:100%;overflow:hidden;border-radius:16px;border:1px solid rgba(255,255,255,0.07);background:rgba(11,15,25,0.55);padding:4px;gap:4px}
.ew-screen .segment button{flex:1 1 7.5rem;min-width:0;border-radius:12px;color:#98A4BA;white-space:normal;text-align:center;padding:8px 10px}
.ew-screen .segment button[aria-pressed="true"]{background:#9585FF;color:#0B0F19}
.ew-screen .alert{background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:16px;color:#F8FAFC;overflow-wrap:anywhere}
.ew-screen .alert.error{color:#FF738A;border-color:rgba(255,115,138,0.4)}
.ew-screen .alert.info{color:#98A4BA}
.ew-section{display:grid;gap:10px;min-width:0;max-width:100%;overflow-x:hidden}
.ew-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;min-width:0}
.ew-section-head h2{margin:0;min-width:0}
.ew-screen .ew-section-head h2 a{color:#F8FAFC;text-decoration:none}
.ew-screen .ew-section-head h2 a:hover{color:#9585FF}
.ew-section-head .ew-more{flex:0 0 auto;font-size:.9rem}
.ew-section-head button.ew-more{border:0;background:transparent;color:#9585FF;font:inherit;cursor:pointer;padding:0}
.ew-screen a.ew-row{color:inherit;text-decoration:none}
.ew-screen a.ew-row .ew-name{color:#F8FAFC}
.ew-hero{display:grid;gap:8px;padding:18px 16px 14px;border-radius:24px;overflow:hidden}
.ew-kicker{margin:0;color:#98A4BA;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase}
.ew-figure{margin:0;font-family:inherit;font-size:clamp(1.75rem,8vw,2.5rem);line-height:1.05;font-variant-numeric:tabular-nums;letter-spacing:-.03em;overflow-wrap:anywhere;max-width:100%}
.ew-hero-line,.ew-sublist li{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 12px;min-width:0}
.ew-hero-line{padding-top:10px;border-top:1px solid rgba(255,255,255,0.07)}
.ew-hero-line span,.ew-sublist .ew-label{color:#98A4BA;min-width:0;flex:1 1 8rem;overflow-wrap:anywhere}
.ew-sublist{list-style:none;margin:4px 0 0;padding:0;display:grid;gap:8px;min-width:0}
.ew-sublist .ew-label{color:#F8FAFC}
.ew-amt{font-variant-numeric:tabular-nums;text-align:right;margin-left:auto;color:#F8FAFC}
.ew-exp{color:#FF738A}
.ew-list{list-style:none;margin:0;padding:0;display:grid;gap:10px;width:100%;max-width:100%;min-width:0;overflow-x:hidden}
.ew-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,46%);gap:4px 12px;align-items:start;padding:14px 16px;overflow:hidden}
.ew-name{grid-column:1;grid-row:1;color:#F8FAFC;overflow-wrap:anywhere;line-height:1.35}
.ew-row>.ew-amt{grid-column:2;grid-row:1;justify-self:end;align-self:start;white-space:normal;overflow-wrap:anywhere;max-width:100%;text-align:right}
.ew-meta{grid-column:1 / -1;color:#98A4BA;font-size:.85rem;overflow-wrap:anywhere}
.ew-empty{display:grid;gap:10px;justify-items:start;padding:16px}
.ew-empty p{color:#F8FAFC}
.ew-hero .ew-empty{background:transparent;border:0;padding:0}
.ew-screen .money{padding:16px;display:grid;gap:12px;width:100%;overflow:hidden}
.ew-screen .money-kicker,.ew-screen .money-caption,.ew-screen .money-income,.ew-screen .money-name{color:#98A4BA}
.ew-screen .money-figure{color:#FF738A;font-size:clamp(1.55rem,7vw,2.1rem);overflow-wrap:anywhere;max-width:100%}
.ew-screen .money-pos{color:#4EE0B5}
.ew-screen .money-list{border-top-color:rgba(255,255,255,0.07);width:100%;min-width:0}
.ew-screen .money-list li{grid-template-columns:minmax(0,1fr) minmax(0,48%);border-bottom-color:rgba(255,255,255,0.07);max-width:100%}
.ew-screen .money-amt{color:#FF738A;text-align:right;font-variant-numeric:tabular-nums;white-space:normal;overflow-wrap:anywhere}
.ew-screen .money-list .money-income,.ew-screen .money-list .fx{overflow-wrap:anywhere}
`;

function moneyColor(kind: Transaction["kind"]) {
  if (kind === "expense") return "#FF738A";
  if (kind === "income") return "#4EE0B5";
  return "#F8FAFC";
}

function monthExpense(report: ReportModel, view: "separate" | "consolidated" | "both") {
  if (view !== "separate" && report.consolidated) return formatMoney(report.consolidated.expense, "RON");
  const row = report.byCurrency.find((item) => item.currency === "RON") ?? report.byCurrency[0];
  return row ? formatMoney(row.expense, row.currency) : "—";
}

function unifiedBalance(rows: Account[]) {
  if (!rows.length) return null;
  const currency = rows[0].currency;
  if (rows.some((account) => account.currency !== currency)) return null;
  const cents = rows.reduce((sum, account) => {
    const numeric = Number(String(account.balance ?? account.opening_balance ?? "0").replace(/\s/g, "").replace(",", "."));
    return sum + (Number.isFinite(numeric) ? Math.round(numeric * 100) : 0);
  }, 0);
  return { currency, amount: cents / 100 };
}

function Dashboard() {
  const { user } = useAuth();
  const view = user?.report_view ?? "both";
  const startDay = user?.period_start_day ?? 1;
  return (
    <SpaceBody>
      {(space) => (
        <DashboardBody spaceId={space.id} role={space.role} view={view} name={space.name} startDay={startDay} />
      )}
    </SpaceBody>
  );
}

function DashboardBody({
  spaceId,
  role,
  view,
  name,
  startDay,
}: {
  spaceId: string;
  role: "owner" | "admin" | "editor" | "viewer";
  view: "separate" | "consolidated" | "both";
  name: string;
  startDay: number;
}) {
  const [period, setPeriod] = useState<IsoPeriod | null>(null);
  const [report, setReport] = useState<ReportModel | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPeriod(readStoredPeriod(startDay));
  }, [startDay]);

  function applyPeriod(next: IsoPeriod) {
    writeStoredPeriod(startDay, next);
    setPeriod(next);
  }

  useEffect(() => {
    if (!period) return;
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      resources.report({ spaceId, from: period.from, to: period.to, view }),
      resources.balances(spaceId).catch(() => []),
      resources.accounts(spaceId),
      resources.transactions(spaceId, { from: period.from, to: period.to }),
    ])
      .then(([nextReport, balances, nextAccounts, transactions]) => {
        if (!alive) return;
        setReport(nextReport);
        setAccounts(
          nextAccounts.map((account) => {
            const balance = balances.find((item) => item.account_id === account.id);
            return balance ? { ...account, balance: balance.balance } : account;
          }),
        );
        setRows(transactions);
      })
      .catch((cause) => {
        if (alive) setError(errorMessage(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [spaceId, view, period]);

  const visibleAccounts = accounts.filter((account) => !account.archived_at);
  const balance = unifiedBalance(visibleAccounts);
  const showAccountLines = visibleAccounts.length > 1 || (visibleAccounts.length > 0 && !balance);
  const recent = showAll ? rows : rows.slice(0, 8);
  const accountHref = canManage(role) ? "/conturi#cont-nou" : "/conturi";
  const accountLabel = canManage(role) ? "Cont nou" : "Conturi";

  return (
    <div className="ew-screen">
      <style>{screenCss}</style>
      <PageHeader
        title={name}
        lede="Soldul este tot contul. Cheltuielile și veniturile sunt pe perioada aleasă."
      />
      {period ? <PeriodBar startDay={startDay} period={period} onApply={applyPeriod} /> : null}
      {error ? <Alert>{error}</Alert> : null}
      {loading || !report ? <p className="muted">Se încarcă panoul…</p> : null}
      {!loading && report ? (
        <>
          <section className="ew-hero" aria-label="Sold și cheltuieli">
            <p className="ew-kicker">{visibleAccounts.length === 1 ? visibleAccounts[0].name : balance ? "Sold" : "Solduri"}</p>
            {balance ? <p className="ew-figure">{formatMoney(balance.amount, balance.currency)}</p> : null}
            {showAccountLines ? (
              <ul className="ew-sublist">
                {visibleAccounts.map((account) => (
                  <li key={account.id}>
                    <span className="ew-label">{account.name}</span>
                    <span className="ew-amt">{formatMoney(account.balance ?? account.opening_balance, account.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {!visibleAccounts.length ? (
              <div className="ew-empty">
                <p>Încă nu există conturi de arătat.</p>
                <Link href={accountHref}>{accountLabel}</Link>
              </div>
            ) : null}
            <div className="ew-hero-line">
              <span>Cheltuieli, perioada</span>
              <strong className="ew-amt ew-exp">{monthExpense(report, view)}</strong>
            </div>
          </section>
          <section className="ew-section" aria-label="Venituri și cheltuieli">
            <h2>Venituri și cheltuieli</h2>
            <MoneySummary report={report} view={view} />
          </section>
          <section className="ew-section">
            <div className="ew-section-head">
              <h2>Ultimele tranzacții</h2>
              {rows.length > 8 ? (
                <button className="ew-more" type="button" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>
                  {showAll ? "Arată mai puțin" : "Vezi toate"}
                </button>
              ) : null}
            </div>
            {recent.length ? (
              <ul className="ew-list">
                {recent.map((row) => (
                  <li key={row.id}>
                    <Link className="ew-row" href={`/tranzactii/${row.id}`}>
                      <div className="ew-name">{row.description || row.category_name || "—"}</div>
                      <div className="ew-amt" style={{ color: moneyColor(row.kind) }}>
                        {formatMoney(row.amount, row.currency)}
                      </div>
                      <div className="ew-meta">
                        {formatDisplayDate(row.occurred_on)} · {TX_KIND_LABEL[row.kind]}
                        {row.fx_rate ? ` · ${fxCaption(row.fx_rate, row.fx_source, row.fx_rate_date)}` : ""}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ew-empty">
                <p>Încă nu există tranzacții în perioada aleasă.</p>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <Dashboard />
    </Guard>
  );
}
