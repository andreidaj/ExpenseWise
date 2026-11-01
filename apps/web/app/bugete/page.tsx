"use client";

import { useEffect, useState } from "react";
import { Guard } from "@/components/Guard";
import { PeriodBar } from "@/components/PeriodBar";
import { SpaceBody } from "@/components/SpaceBody";
import { Alert, Field, PageHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatMoney, plainAmount, toAmount, toCurrency } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { canManage } from "@/lib/permissions";
import { periodYearMonth, readStoredPeriod, writeStoredPeriod, type IsoPeriod } from "@/lib/period";
import { resources } from "@/lib/resources";
import { CURRENCIES, type Budget, type Category, type Space } from "@/lib/types";

const screenCss = `
.ew-screen{width:100%;max-width:100%;min-width:0;overflow-x:hidden;display:grid;gap:16px;background:transparent;color:#F8FAFC}
.ew-screen h1,.ew-screen h2{font-family:inherit;color:#F8FAFC}
.ew-screen h1{font-size:1.7rem;line-height:1.15;overflow-wrap:anywhere}
.ew-screen h2{font-size:1.05rem;line-height:1.3;overflow-wrap:anywhere;margin:0}
.ew-screen .muted,.ew-screen .page-lede,.ew-screen .field span{color:#98A4BA}
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
.ew-screen .card,.ew-screen .ew-card,.ew-screen .ew-empty{
  background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:20px;box-shadow:none;color:#F8FAFC;max-width:100%;min-width:0
}
.ew-screen .card{padding:16px;overflow:hidden}
.ew-screen .btn{min-height:44px;font-family:inherit}
.ew-screen .btn.primary,.ew-screen .btn.primary:hover{background:#9585FF;border-color:#9585FF;color:#0B0F19}
.ew-screen .btn.danger,.ew-screen .btn.danger:hover{background:transparent;color:#FF738A;border-color:rgba(255,115,138,0.45)}
.ew-screen .btn.ghost,.ew-screen .btn.ghost:hover{background:transparent;color:#F8FAFC;border-color:rgba(255,255,255,0.07)}
.ew-screen input,.ew-screen select{width:100%;max-width:100%;min-width:0;background:rgba(11,15,25,0.72);color:#F8FAFC;border:1px solid rgba(255,255,255,0.07);border-radius:14px;font-family:inherit}
.ew-screen input:focus,.ew-screen select:focus{border-color:#9585FF;outline-color:#9585FF}
.ew-screen .alert{background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:16px;color:#F8FAFC;overflow-wrap:anywhere}
.ew-screen .alert.error{color:#FF738A;border-color:rgba(255,115,138,0.4)}
.ew-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;width:100%;min-width:0}
.ew-end{display:flex;flex-wrap:wrap;gap:10px;width:100%}
.ew-end .btn{flex:1 1 100%;min-height:44px}
@media (min-width:840px){.ew-end{justify-content:flex-end}.ew-end .btn{flex:0 1 auto}}
.ew-list{list-style:none;margin:0;padding:0;display:grid;gap:10px;width:100%;max-width:100%;min-width:0;overflow-x:hidden}
.ew-card{display:grid;gap:8px;padding:16px;overflow:hidden}
.ew-card-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;min-width:0}
.ew-card-head h2{flex:1 1 10rem;min-width:0}
.ew-card-head .btn{flex:1 1 auto}
.ew-card-head .ew-actions{display:flex;flex:0 0 auto;gap:8px}
.ew-card-head .ew-actions .btn{flex:0 0 auto;min-height:36px;padding:0 10px}
.ew-line{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 12px;min-width:0}
.ew-line span:first-child{color:#98A4BA;min-width:0;overflow-wrap:anywhere}
.ew-amt{margin-left:auto;text-align:right;font-variant-numeric:tabular-nums;color:#F8FAFC;overflow-wrap:anywhere}
.ew-bar{height:4px;width:100%;border-radius:99px;background:rgba(255,255,255,0.08);overflow:hidden}
.ew-bar>span{display:block;height:100%;max-width:100%;border-radius:99px;background:#4EE0B5}
.ew-bar.over>span{background:#FF738A}
.ew-note{margin:0;color:#98A4BA;font-size:.85rem;overflow-wrap:anywhere}
.ew-empty{display:grid;gap:10px;justify-items:start;padding:16px}
.ew-empty p{color:#F8FAFC}
.ew-screen form.card{margin-bottom:24px}
.ew-screen #buget-nou{margin-bottom:96px}
`;

function Budgets({ space }: { space: Space }) {
  const { user } = useAuth();
  const startDay = user?.period_start_day ?? 1;
  const [period, setPeriod] = useState<IsoPeriod | null>(null);
  const [rows, setRows] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState("");
  const [currency, setCurrency] = useState(space.base_currency || "RON");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function applyPeriod(next: IsoPeriod) {
    writeStoredPeriod(startDay, next);
    setPeriod(next);
  }

  async function load(next: IsoPeriod) {
    const { year, month } = periodYearMonth(next.from);
    const [budgets, nextCategories] = await Promise.all([
      resources.budgets(space.id, { year, month, from: next.from, to: next.to }),
      resources.categories(space.id),
    ]);
    setRows(budgets.filter((budget) => budget.year === year && budget.month === month));
    setCategories(nextCategories.filter((category) => category.kind === "expense" && !category.archived_at));
  }

  useEffect(() => {
    setPeriod(readStoredPeriod(startDay));
  }, [startDay]);

  useEffect(() => {
    if (!period) return;
    let alive = true;
    setReady(false);
    void load(period)
      .catch((cause) => {
        if (alive) setError(errorMessage(cause));
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.id, period]);

  useEffect(() => {
    if (!open) return;
    document.getElementById("buget-nou")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (!period) return;
      const { year, month } = periodYearMonth(period.from);
      const body = {
        year,
        month,
        limit_amount: toAmount(limit, { allowZero: true }),
        currency: toCurrency(currency),
        category_id: categoryId || null,
      };
      if (editingId) await resources.patchBudget(space.id, editingId, body);
      else await resources.createBudget(space.id, body);
      setLimit("");
      setEditingId(null);
      setOpen(false);
      await load(period);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  function closeForm() {
    setOpen(false);
    setEditingId(null);
  }

  function beginEdit(budget: Budget) {
    setEditingId(budget.id);
    setCategoryId(budget.category_id || "");
    setLimit(plainAmount(budget.limit_amount));
    setCurrency(budget.currency);
    setOpen(true);
  }

  async function remove(budget: Budget) {
    if (!window.confirm("Ștergi bugetul?")) return;
    setError(null);
    try {
      await resources.deleteBudget(space.id, budget.id);
      if (period) await load(period);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const manage = canManage(space.role);

  return (
    <div className="ew-screen">
      <style>{screenCss}</style>
      <PageHeader
        title="Bugete"
        lede="Consumul este pe aceeași perioadă ca panoul, în moneda bugetului."
        action={
          manage ? (
            <button
              className="btn primary"
              type="button"
              aria-expanded={open}
              onClick={() => {
                if (open) closeForm();
                else {
                  setEditingId(null);
                  setCategoryId("");
                  setLimit("");
                  setCurrency(space.base_currency || "RON");
                  setOpen(true);
                }
              }}
            >
              {open ? "Închide" : "Buget nou"}
            </button>
          ) : null
        }
      />
      {period ? <PeriodBar startDay={startDay} period={period} onApply={applyPeriod} /> : null}
      {error ? <Alert>{error}</Alert> : null}
      {!ready ? <p className="muted">Se încarcă bugetele…</p> : null}
      {ready && rows.length ? (
        <ul className="ew-list">
          {rows.map((budget) => {
            const width = Math.min(100, Math.max(0, budget.percent));
            const category = budget.category_name || categories.find((item) => item.id === budget.category_id)?.name;
            const over = budget.percent > 100;
            return (
              <li key={budget.id} className="ew-card">
                <div className="ew-card-head">
                  <h2>{category || "Tot spațiul"}</h2>
                  {manage ? (
                    <div className="ew-actions">
                      <button className="btn ghost" type="button" onClick={() => beginEdit(budget)}>
                        Modifică
                      </button>
                      <button className="btn danger" type="button" onClick={() => void remove(budget)}>
                        Șterge
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="ew-line">
                  <span>Consumat</span>
                  <span className="ew-amt">{formatMoney(budget.spent, budget.currency)}</span>
                </div>
                <div className="ew-line">
                  <span>Limită</span>
                  <span className="ew-amt">{formatMoney(budget.limit_amount, budget.currency)}</span>
                </div>
                <div className={over ? "ew-bar over" : "ew-bar"} aria-hidden="true">
                  <span style={{ width: `${width}%` }} />
                </div>
                <p className="ew-note">
                  Rămas {formatMoney(budget.remaining, budget.currency)} · {budget.percent.toFixed(0)}%
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
      {ready && !error && !rows.length ? (
        <div className="ew-empty">
          <p>Niciun buget în perioada aleasă.</p>
          {manage ? (
            <button className="btn ghost" type="button" onClick={() => setOpen(true)}>
              Buget nou
            </button>
          ) : null}
        </div>
      ) : null}
      {manage && open ? (
        <form id="buget-nou" className="card stack" style={{ scrollMarginTop: 84 }} onSubmit={(event) => void submit(event)}>
          <h2>{editingId ? "Modifică bugetul" : "Buget nou"}</h2>
          <div className="ew-fields">
            <Field label="Categorie">
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Tot spațiul</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Limită">
              <input inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)} required />
            </Field>
            <Field label="Monedă">
              <input list="monede-buget" value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} required />
              <datalist id="monede-buget">
                {CURRENCIES.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
            </Field>
          </div>
          <div className="ew-end">
            <button className="btn ghost" type="button" onClick={closeForm}>
              Anulează
            </button>
            <button className="btn primary" type="submit" disabled={pending}>
              {pending ? "Se salvează…" : editingId ? "Salvează" : "Salvează bugetul"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <SpaceBody>{(space) => <Budgets space={space} />}</SpaceBody>
    </Guard>
  );
}
