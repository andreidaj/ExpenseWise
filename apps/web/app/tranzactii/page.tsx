"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Guard } from "@/components/Guard";
import { SpaceBody } from "@/components/SpaceBody";
import { Alert, Field, PageHeader } from "@/components/ui";
import { formatDisplayDate, formatMoney, fxCaption, monthStartDisplay, parseDisplayDate, todayDisplay } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { canDelete, canWriteTransactions } from "@/lib/permissions";
import { resources } from "@/lib/resources";
import { TX_KIND_LABEL, type Space, type Transaction, type TxKind } from "@/lib/types";

const screenCss = `
.ew-screen{width:100%;max-width:100%;min-width:0;overflow-x:hidden;display:grid;gap:16px;background:transparent;color:#F8FAFC}
.ew-screen h1,.ew-screen h2,.ew-screen h3{font-family:inherit;color:#F8FAFC}
.ew-screen h1{font-size:1.7rem;line-height:1.15;overflow-wrap:anywhere}
.ew-screen .muted,.ew-screen .page-lede,.ew-screen .fx,.ew-screen .field span{color:#98A4BA}
.ew-screen a{color:#9585FF}
.ew-screen .page-head{display:flex;flex-direction:column;align-items:stretch;gap:12px;width:100%;max-width:100%}
.ew-screen .page-head>.stack,.ew-screen .page-lede{min-width:0;width:100%;max-width:100%}
.ew-screen .page-action{width:100%}
.ew-screen .page-action>.btn,.ew-screen .page-action>a{width:100%;min-height:44px}
@media (min-width:840px){
  .ew-screen .page-head{flex-direction:row;flex-wrap:wrap;align-items:flex-end;justify-content:space-between}
  .ew-screen .page-head>.stack{width:auto;flex:1 1 16rem}
  .ew-screen .page-action{width:auto;flex:0 0 auto}
  .ew-screen .page-action>.btn,.ew-screen .page-action>a{width:auto}
}
.ew-screen .card,.ew-screen .ew-row,.ew-screen .ew-empty{
  background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:20px;box-shadow:none;color:#F8FAFC;max-width:100%;min-width:0
}
.ew-screen .card{padding:16px;overflow:hidden}
.ew-screen .btn{min-height:44px;font-family:inherit}
.ew-screen .btn.small{min-height:44px}
.ew-screen .btn.primary,.ew-screen .btn.primary:hover{background:#9585FF;border-color:#9585FF;color:#0B0F19}
.ew-screen .btn.danger,.ew-screen .btn.danger:hover{background:transparent;color:#FF738A;border-color:rgba(255,115,138,0.45)}
.ew-screen .btn.ghost,.ew-screen .btn.ghost:hover{background:transparent;color:#F8FAFC;border-color:rgba(255,255,255,0.07)}
.ew-screen input,.ew-screen select,.ew-screen textarea{width:100%;max-width:100%;min-width:0;background:rgba(11,15,25,0.72);color:#F8FAFC;border:1px solid rgba(255,255,255,0.07);border-radius:14px;font-family:inherit}
.ew-screen input:focus,.ew-screen select:focus,.ew-screen textarea:focus{border-color:#9585FF;outline-color:#9585FF}
.ew-screen .alert{background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:16px;color:#F8FAFC;overflow-wrap:anywhere}
.ew-screen .alert.error{color:#FF738A;border-color:rgba(255,115,138,0.4)}
.ew-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;width:100%;min-width:0}
.ew-end{display:flex;flex-wrap:wrap;gap:10px;width:100%}
.ew-end .btn{flex:1 1 100%;min-height:44px}
@media (min-width:840px){.ew-end{justify-content:flex-end}.ew-end .btn{flex:0 1 auto}}
.ew-list{list-style:none;margin:0;padding:0;display:grid;gap:10px;width:100%;max-width:100%;min-width:0;overflow-x:hidden}
.ew-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,46%);gap:4px 12px;align-items:start;padding:14px 16px;overflow:hidden}
.ew-name{grid-column:1;grid-row:1;color:#F8FAFC;overflow-wrap:anywhere;line-height:1.35}
.ew-amt{grid-column:2;grid-row:1;justify-self:end;align-self:start;text-align:right;font-variant-numeric:tabular-nums;white-space:normal;overflow-wrap:anywhere;max-width:100%}
.ew-meta{grid-column:1 / -1;color:#98A4BA;font-size:.85rem;overflow-wrap:anywhere}
.ew-actions{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;max-width:100%}
.ew-actions .btn,.ew-actions a.btn{flex:1 1 8rem;min-height:44px}
.ew-empty{display:grid;gap:10px;justify-items:start;padding:16px}
.ew-empty p{color:#F8FAFC}
`;

function moneyColor(kind: TxKind) {
  if (kind === "expense") return "#FF738A";
  if (kind === "income") return "#4EE0B5";
  return "#F8FAFC";
}

function Transactions({ space }: { space: Space }) {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [from, setFrom] = useState(monthStartDisplay());
  const [to, setTo] = useState(todayDisplay());
  const [kind, setKind] = useState<"" | TxKind>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [applied, setApplied] = useState({ from: monthStartDisplay(), to: todayDisplay(), kind: "" as "" | TxKind });

  async function load(nextFrom = from, nextTo = to, nextKind = kind) {
    setLoading(true);
    setError(null);
    try {
      const query: { from?: string; to?: string; kind?: string } = {};
      if (nextFrom.trim()) query.from = parseDisplayDate(nextFrom);
      if (nextTo.trim()) query.to = parseDisplayDate(nextTo);
      if (nextKind) query.kind = nextKind;
      setRows(await resources.transactions(space.id, query));
      setApplied({ from: nextFrom, to: nextTo, kind: nextKind });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(monthStartDisplay(), todayDisplay(), "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.id]);

  async function remove(row: Transaction) {
    if (!window.confirm("Ștergi tranzacția? Rămâne marcată ca ștearsă și iese din sold.")) return;
    setError(null);
    try {
      await resources.deleteTransaction(space.id, row.id);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="ew-screen">
      <style>{screenCss}</style>
      <PageHeader
        title="Tranzacții"
        lede="Lista folosește perioada de sub titlu."
        action={
          canWriteTransactions(space.role) ? (
            <Link className="btn primary" href="/tranzactii/nou">
              Tranzacție nouă
            </Link>
          ) : null
        }
      />
      <p className="muted">
        {applied.from || "—"} – {applied.to || "—"}
        {applied.kind ? ` · ${TX_KIND_LABEL[applied.kind]}` : ""}
      </p>
      <div className="ew-end">
        <button className="btn ghost" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
          {filtersOpen ? "Închide" : "Filtre"}
        </button>
      </div>
      {filtersOpen ? (
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <div className="ew-fields">
          <Field label="De la">
            <input value={from} placeholder="ZZ.LL.AAAA" onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="Până la">
            <input value={to} placeholder="ZZ.LL.AAAA" onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Field label="Tip">
            <select value={kind} onChange={(event) => setKind(event.target.value as "" | TxKind)}>
              <option value="">Toate</option>
              <option value="expense">Cheltuieli</option>
              <option value="income">Venituri</option>
              <option value="transfer">Transferuri</option>
            </select>
          </Field>
        </div>
        <div className="ew-end">
          <button className="btn ghost" type="submit">
            Filtrează
          </button>
        </div>
      </form>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
      {loading ? <p className="muted">Se încarcă tranzacțiile…</p> : null}
      {rows.length ? (
        <ul className="ew-list">
          {rows.map((row) => (
            <li key={row.id} className="ew-row">
              <div className="ew-name">{row.description || row.category_name || "—"}</div>
              <div className="ew-amt" style={{ color: moneyColor(row.kind) }}>
                {formatMoney(row.amount, row.currency)}
              </div>
              <div className="ew-meta">
                {formatDisplayDate(row.occurred_on)} · {TX_KIND_LABEL[row.kind]} · {row.account_name || "Cont"}
                {row.kind === "transfer" && row.counter_amount ? ` · → ${formatMoney(row.counter_amount, row.counter_currency)}` : ""}
                {row.fx_rate ? ` · ${fxCaption(row.fx_rate, row.fx_source, row.fx_rate_date)}` : ""}
              </div>
              <div className="ew-actions">
                {row.kind === "debt" || row.kind === "repayment" ? (
                  <Link className="btn ghost" href="/datorii">
                    Datorii
                  </Link>
                ) : canWriteTransactions(space.role) ? (
                  <Link className="btn ghost" href={`/tranzactii/${row.id}`}>
                    Modifică
                  </Link>
                ) : (
                  <Link className="btn ghost" href={`/tranzactii/${row.id}`}>
                    Vezi
                  </Link>
                )}
                {canDelete(space.role) && row.kind !== "debt" && row.kind !== "repayment" ? (
                  <button className="btn danger" type="button" onClick={() => void remove(row)}>
                    Șterge
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {!loading && !rows.length ? (
        <div className="ew-empty">
          <p>Nicio tranzacție în filtrul ales.</p>
          {canWriteTransactions(space.role) ? <Link href="/tranzactii/nou">Tranzacție nouă</Link> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <SpaceBody>{(space) => <Transactions space={space} />}</SpaceBody>
    </Guard>
  );
}
