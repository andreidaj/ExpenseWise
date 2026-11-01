"use client";

import { useEffect, useState } from "react";
import { Guard } from "@/components/Guard";
import { SpaceBody } from "@/components/SpaceBody";
import { Alert, Field, PageHeader } from "@/components/ui";
import { formatDisplayDate, formatMoney, parseDisplayDate, plainAmount, toAmount, toCurrency } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { canManage } from "@/lib/permissions";
import { resources } from "@/lib/resources";
import { CURRENCIES, type Account, type Goal, type Space } from "@/lib/types";

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
.ew-inc{color:#4EE0B5}
.ew-bar{height:4px;width:100%;border-radius:99px;background:rgba(255,255,255,0.08);overflow:hidden}
.ew-bar>span{display:block;height:100%;max-width:100%;border-radius:99px;background:#4EE0B5}
.ew-note{margin:0;color:#98A4BA;font-size:.85rem;overflow-wrap:anywhere}
.ew-empty{display:grid;gap:10px;justify-items:start;padding:16px}
.ew-empty p{color:#F8FAFC}
.ew-screen #obiectiv-nou{margin-bottom:96px}
`;

function Goals({ space }: { space: Space }) {
  const [rows, setRows] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [currency, setCurrency] = useState(space.base_currency || "RON");
  const [targetDate, setTargetDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    const [goals, nextAccounts] = await Promise.all([resources.goals(space.id), resources.accounts(space.id)]);
    setRows(goals);
    setAccounts(nextAccounts.filter((account) => !account.archived_at && account.kind === "savings"));
  }

  useEffect(() => {
    let alive = true;
    setReady(false);
    void load()
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
  }, [space.id]);

  useEffect(() => {
    if (!open) return;
    document.getElementById("obiectiv-nou")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        target_amount: toAmount(target),
        currency: toCurrency(currency),
        target_date: targetDate.trim() ? parseDisplayDate(targetDate) : null,
        account_id: accountId || null,
      };
      if (editingId) await resources.patchGoal(space.id, editingId, body);
      else await resources.createGoal(space.id, body);
      setName("");
      setTarget("");
      setTargetDate("");
      setAccountId("");
      setEditingId(null);
      setOpen(false);
      await load();
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

  function beginEdit(goal: Goal) {
    setEditingId(goal.id);
    setName(goal.name);
    setTarget(plainAmount(goal.target_amount));
    setCurrency(goal.currency);
    setTargetDate(goal.target_date ? formatDisplayDate(goal.target_date) : "");
    setAccountId(goal.account_id || "");
    setOpen(true);
  }

  async function remove(goal: Goal) {
    if (!window.confirm(`Ștergi obiectivul ${goal.name}?`)) return;
    setError(null);
    try {
      await resources.deleteGoal(space.id, goal.id);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const manage = canManage(space.role);
  const visible = rows.filter((goal) => !goal.archived_at);

  return (
    <div className="ew-screen">
      <style>{screenCss}</style>
      <PageHeader
        title="Obiective"
        lede="Progresul vine din tranzacțiile legate, nu din tot soldul contului."
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
                  setName("");
                  setTarget("");
                  setTargetDate("");
                  setAccountId("");
                  setCurrency(space.base_currency || "RON");
                  setOpen(true);
                }
              }}
            >
              {open ? "Închide" : "Obiectiv nou"}
            </button>
          ) : null
        }
      />
      {error ? <Alert>{error}</Alert> : null}
      {!ready ? <p className="muted">Se încarcă obiectivele…</p> : null}
      {ready && visible.length ? (
        <ul className="ew-list">
          {visible.map((goal) => {
            const width = Math.min(100, Math.max(0, goal.percent));
            return (
              <li key={goal.id} className="ew-card">
                <div className="ew-card-head">
                  <h2>{goal.name}</h2>
                  {manage ? (
                    <div className="ew-actions">
                      <button className="btn ghost" type="button" onClick={() => beginEdit(goal)}>
                        Modifică
                      </button>
                      <button className="btn danger" type="button" onClick={() => void remove(goal)}>
                        Șterge
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="ew-line">
                  <span>Progres</span>
                  <span className="ew-amt ew-inc">{formatMoney(goal.progress, goal.currency)}</span>
                </div>
                <div className="ew-line">
                  <span>Țintă</span>
                  <span className="ew-amt">{formatMoney(goal.target_amount, goal.currency)}</span>
                </div>
                <div className="ew-bar" aria-hidden="true">
                  <span style={{ width: `${width}%` }} />
                </div>
                <p className="ew-note">
                  {goal.percent.toFixed(0)}%{goal.target_date ? ` · până la ${formatDisplayDate(goal.target_date)}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
      {ready && !error && !visible.length ? (
        <div className="ew-empty">
          <p>Niciun obiectiv.</p>
          {manage ? (
            <button className="btn ghost" type="button" onClick={() => setOpen(true)}>
              Obiectiv nou
            </button>
          ) : null}
        </div>
      ) : null}
      {manage && open ? (
        <form id="obiectiv-nou" className="card stack" style={{ scrollMarginTop: 84 }} onSubmit={(event) => void submit(event)}>
          <h2>{editingId ? "Modifică obiectivul" : "Obiectiv nou"}</h2>
          <div className="ew-fields">
            <Field label="Nume">
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label="Sumă țintă">
              <input inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} required />
            </Field>
            <Field label="Monedă">
              <input list="monede-obiectiv" value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} required />
              <datalist id="monede-obiectiv">
                {CURRENCIES.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
            </Field>
            <Field label="Data (opțional)">
              <input placeholder="ZZ.LL.AAAA" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
            </Field>
            <Field label="Cont de economii (opțional)">
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">Fără cont</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="ew-end">
            <button className="btn ghost" type="button" onClick={closeForm}>
              Anulează
            </button>
            <button className="btn primary" type="submit" disabled={pending}>
              {pending ? "Se salvează…" : editingId ? "Salvează" : "Adaugă obiectivul"}
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
      <SpaceBody>{(space) => <Goals space={space} />}</SpaceBody>
    </Guard>
  );
}
