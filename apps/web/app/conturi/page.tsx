"use client";

import { useEffect, useState } from "react";
import { Guard } from "@/components/Guard";
import { SpaceBody } from "@/components/SpaceBody";
import { Alert, Field, PageHeader } from "@/components/ui";
import { formatDisplayDate, formatMoney, parseDisplayDate, todayDisplay, toAmount, toCurrency } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { canManage } from "@/lib/permissions";
import { resources } from "@/lib/resources";
import { ACCOUNT_KIND_LABEL, CURRENCIES, type Account, type AccountKind, type Space } from "@/lib/types";

const screenCss = `
.ew-screen{width:100%;max-width:100%;min-width:0;overflow-x:hidden;display:grid;gap:16px;background:transparent;color:#F8FAFC}
.ew-screen h1,.ew-screen h2{font-family:inherit;color:#F8FAFC}
.ew-screen h1{font-size:1.7rem;line-height:1.15;overflow-wrap:anywhere}
.ew-screen h2{font-size:1.05rem;line-height:1.3;overflow-wrap:anywhere}
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
.ew-screen .card,.ew-screen .ew-row,.ew-screen .ew-empty{
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
.ew-screen .badge{background:rgba(149,133,255,0.18);color:#F8FAFC}
.ew-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;width:100%;min-width:0}
.ew-end{display:flex;flex-wrap:wrap;gap:10px;width:100%}
.ew-end .btn{flex:1 1 100%;min-height:44px}
@media (min-width:840px){.ew-end{justify-content:flex-end}.ew-end .btn{flex:0 1 auto}}
.ew-list{list-style:none;margin:0;padding:0;display:grid;gap:10px;width:100%;max-width:100%;min-width:0;overflow-x:hidden}
.ew-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,46%);gap:4px 12px;align-items:start;padding:14px 16px;overflow:hidden}
.ew-name{grid-column:1;grid-row:1;color:#F8FAFC;overflow-wrap:anywhere;line-height:1.35}
.ew-amt{grid-column:2;grid-row:1;justify-self:end;align-self:start;text-align:right;font-variant-numeric:tabular-nums;white-space:normal;overflow-wrap:anywhere;max-width:100%;color:#F8FAFC}
.ew-meta{grid-column:1 / -1;color:#98A4BA;font-size:.85rem;overflow-wrap:anywhere}
.ew-actions{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;max-width:100%}
.ew-actions .btn{flex:1 1 8rem;min-height:44px}
.ew-empty{display:grid;gap:10px;justify-items:start;padding:16px}
.ew-empty p{color:#F8FAFC}
`;

function Accounts({ space }: { space: Space }) {
  const manage = canManage(space.role);
  const [rows, setRows] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("bank");
  const [currency, setCurrency] = useState(space.base_currency || "RON");
  const [opening, setOpening] = useState("0");
  const [openingDate, setOpeningDate] = useState(todayDisplay());
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  async function load() {
    const [accounts, balances] = await Promise.all([
      resources.accounts(space.id),
      resources.balances(space.id).catch(() => []),
    ]);
    setRows(
      accounts.map((account) => {
        const balance = balances.find((item) => item.account_id === account.id);
        return balance ? { ...account, balance: balance.balance } : account;
      }),
    );
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
    if (window.location.hash === "#cont-nou") setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.getElementById("cont-nou")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [open, editing]);

  function resetForm() {
    setEditing(null);
    setName("");
    setKind("bank");
    setCurrency(space.base_currency || "RON");
    setOpening("0");
    setOpeningDate(todayDisplay());
    setOpen(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (editing) {
        await resources.patchAccount(space.id, editing.id, { name: name.trim(), kind });
      } else {
        await resources.createAccount(space.id, {
          name: name.trim(),
          kind,
          currency: toCurrency(currency),
          opening_balance: toAmount(opening, { allowZero: true }),
          opening_balance_date: parseDisplayDate(openingDate),
        });
      }
      resetForm();
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function remove(account: Account) {
    if (!window.confirm(`Ștergi contul ${account.name}?`)) return;
    setError(null);
    try {
      await resources.deleteAccount(space.id, account.id);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  function edit(account: Account) {
    setEditing(account);
    setName(account.name);
    setKind(account.kind);
    setCurrency(account.currency);
    setOpen(true);
  }

  return (
    <div className="ew-screen">
      <style>{screenCss}</style>
      <PageHeader
        title="Conturi"
        lede="Numerar, bancă, card sau economii. Moneda rămâne cea de la creare."
        action={
          manage && !editing ? (
            <button className="btn primary" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
              {open ? "Închide" : "Cont nou"}
            </button>
          ) : null
        }
      />
      {error ? <Alert>{error}</Alert> : null}
      {!ready ? <p className="muted">Se încarcă conturile…</p> : null}
      {ready && rows.length ? (
        <ul className="ew-list">
          {rows.map((account) => (
            <li key={account.id} className="ew-row">
              <div className="ew-name">
                {account.name} {account.archived_at ? <span className="badge">Arhivat</span> : null}
              </div>
              <div className="ew-amt">{formatMoney(account.balance ?? "0", account.currency)}</div>
              <div className="ew-meta">
                {ACCOUNT_KIND_LABEL[account.kind]} · {account.currency}
                <br />
                Sold inițial {formatMoney(account.opening_balance, account.currency)} la {formatDisplayDate(account.opening_balance_date)}
              </div>
              {manage ? (
                <div className="ew-actions">
                  <button className="btn ghost" type="button" onClick={() => edit(account)}>
                    Modifică
                  </button>
                  <button className="btn danger" type="button" onClick={() => void remove(account)}>
                    Șterge
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {ready && !error && !rows.length ? (
        <div className="ew-empty">
          <p>Încă nu există conturi în acest spațiu.</p>
          {manage ? (
            <button className="btn ghost" type="button" onClick={() => setOpen(true)}>
              Cont nou
            </button>
          ) : null}
        </div>
      ) : null}
      {manage && open ? (
        <form id="cont-nou" className="card stack" style={{ scrollMarginTop: 84 }} onSubmit={(event) => void submit(event)}>
          <h2>{editing ? "Modifică contul" : "Cont nou"}</h2>
          <div className="ew-fields">
            <Field label="Nume">
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label="Tip">
              <select value={kind} onChange={(event) => setKind(event.target.value as AccountKind)}>
                <option value="cash">Numerar</option>
                <option value="bank">Bancă</option>
                <option value="card">Card</option>
                <option value="savings">Economii</option>
              </select>
            </Field>
            <Field label="Monedă">
              <input list="monede-cont" value={currency} disabled={Boolean(editing)} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} required />
              <datalist id="monede-cont">
                {CURRENCIES.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
            </Field>
            {editing ? null : (
              <>
                <Field label="Sold inițial">
                  <input inputMode="decimal" value={opening} onChange={(event) => setOpening(event.target.value)} required />
                </Field>
                <Field label="Data soldului inițial">
                  <input placeholder="ZZ.LL.AAAA" value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} required />
                </Field>
              </>
            )}
          </div>
          {editing ? <p className="muted">Moneda nu se poate schimba după creare.</p> : null}
          <div className="ew-end">
            <button className="btn ghost" type="button" onClick={resetForm}>
              {editing ? "Renunță" : "Anulează"}
            </button>
            <button className="btn primary" type="submit" disabled={pending}>
              {pending ? "Se salvează…" : editing ? "Salvează" : "Adaugă contul"}
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
      <SpaceBody>{(space) => <Accounts space={space} />}</SpaceBody>
    </Guard>
  );
}
