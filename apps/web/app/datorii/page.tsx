"use client";

import { useEffect, useState } from "react";
import { Guard } from "@/components/Guard";
import { SpaceBody } from "@/components/SpaceBody";
import { Alert, Field, PageHeader } from "@/components/ui";
import { formatDisplayDate, formatMoney, parseDisplayDate, todayDisplay, toAmount } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { canDelete, canWriteTransactions } from "@/lib/permissions";
import { resources } from "@/lib/resources";
import type { Account, Debt, Space } from "@/lib/types";

const screenCss = `
.ew-screen{width:100%;max-width:100%;min-width:0;overflow-x:hidden;display:grid;gap:16px;background:transparent;color:#F8FAFC}
.ew-screen h1,.ew-screen h2{font-family:inherit;color:#F8FAFC}
.ew-screen h1{font-size:1.7rem;line-height:1.15;overflow-wrap:anywhere}
.ew-screen h2{font-size:1.05rem;line-height:1.3}
.ew-screen .muted,.ew-screen .page-lede,.ew-screen .field span{color:#98A4BA}
.ew-screen a{color:#9585FF}
.ew-screen .page-head{display:flex;flex-direction:column;align-items:stretch;gap:12px;width:100%}
.ew-screen .card,.ew-screen .ew-row,.ew-screen .ew-empty{background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:20px;color:#F8FAFC}
.ew-screen .card{padding:16px;display:grid;gap:14px}
.ew-screen .btn{min-height:44px;font-family:inherit}
.ew-screen .btn.primary,.ew-screen .btn.primary:hover{background:#9585FF;border-color:#9585FF;color:#0B0F19}
.ew-screen .btn.danger,.ew-screen .btn.danger:hover{background:transparent;color:#FF738A;border-color:rgba(255,115,138,0.45)}
.ew-screen .btn.ghost,.ew-screen .btn.ghost:hover{background:transparent;color:#F8FAFC;border-color:rgba(255,255,255,0.07)}
.ew-screen input,.ew-screen select{width:100%;min-width:0;background:rgba(11,15,25,0.72);color:#F8FAFC;border:1px solid rgba(255,255,255,0.07);border-radius:14px;font-family:inherit}
.ew-screen .alert{background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:16px;color:#F8FAFC}
.ew-screen .alert.error{color:#FF738A;border-color:rgba(255,115,138,0.4)}
.ew-fields{display:grid;gap:14px}
.ew-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.ew-row{display:grid;gap:8px;padding:14px 16px}
.ew-top{display:flex;justify-content:space-between;gap:12px;align-items:start}
.ew-amt{font-variant-numeric:tabular-nums;text-align:right}
.ew-meta{color:#98A4BA;font-size:.85rem}
.ew-actions{display:flex;flex-wrap:wrap;gap:8px}
.ew-actions .btn{flex:1 1 8rem}
.ew-empty{padding:16px}
`;

function Debts({ space }: { space: Space }) {
  const write = canWriteTransactions(space.role);
  const remove = canDelete(space.role);
  const [rows, setRows] = useState<Debt[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayDisplay());
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [back, setBack] = useState<Record<string, { amount: string; accountId: string; date: string }>>({});

  async function load() {
    const [nextDebts, nextAccounts] = await Promise.all([resources.debts(space.id), resources.accounts(space.id)]);
    const active = nextAccounts.filter((account) => !account.archived_at);
    setRows(nextDebts);
    setAccounts(active);
    setAccountId((current) => current || active[0]?.id || "");
  }

  useEffect(() => {
    void load().catch((cause) => setError(errorMessage(cause)));
  }, [space.id]);

  function repayState(debt: Debt) {
    return back[debt.id] || { amount: "", accountId: debt.account_id, date: todayDisplay() };
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await resources.createDebt(space.id, {
        person_name: person.trim(),
        amount: toAmount(amount),
        account_id: accountId,
        occurred_on: parseDisplayDate(date),
        note: note.trim(),
      });
      setPerson("");
      setAmount("");
      setNote("");
      setDate(todayDisplay());
      setOpen(false);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function repay(debt: Debt) {
    const form = repayState(debt);
    setPending(true);
    setError(null);
    try {
      await resources.repayDebt(space.id, debt.id, {
        amount: toAmount(form.amount),
        account_id: form.accountId,
        occurred_on: parseDisplayDate(form.date),
      });
      setBack((current) => ({ ...current, [debt.id]: { amount: "", accountId: form.accountId, date: todayDisplay() } }));
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function erase(debt: Debt) {
    if (!window.confirm(`Ștergi datoria lui ${debt.person_name}? Banii se întorc în conturi.`)) return;
    setError(null);
    try {
      await resources.deleteDebt(space.id, debt.id);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="ew-screen">
      <style>{screenCss}</style>
      <PageHeader
        title="Datorii"
        lede="Banii dați cuiva ies din cont, dar nu se numără la cheltuielile lunii. Aici vezi cât mai are fiecare de dat înapoi."
        action={
          write ? (
            <button className="btn primary" type="button" onClick={() => setOpen((value) => !value)}>
              {open ? "Închide" : "Am dat bani"}
            </button>
          ) : null
        }
      />
      {error ? <Alert>{error}</Alert> : null}
      {write && open ? (
        <form className="card" onSubmit={(event) => void create(event)}>
          <h2>Bani dați</h2>
          <div className="ew-fields">
            <Field label="Cui">
              <input value={person} onChange={(event) => setPerson(event.target.value)} required />
            </Field>
            <Field label="Sumă">
              <input inputMode="decimal" placeholder="0,00" value={amount} onChange={(event) => setAmount(event.target.value)} required />
            </Field>
            <Field label="Din contul">
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.currency}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Data">
              <input value={date} placeholder="ZZ.LL.AAAA" onChange={(event) => setDate(event.target.value)} required />
            </Field>
            <Field label="Notă">
              <input value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </div>
          <button className="btn primary" type="submit" disabled={pending}>
            Salvează
          </button>
        </form>
      ) : null}
      {rows.length ? (
        <ul className="ew-list">
          {rows.map((debt) => {
            const form = repayState(debt);
            return (
              <li key={debt.id} className="ew-row">
                <div className="ew-top">
                  <strong>{debt.person_name}</strong>
                  <span className="ew-amt">{formatMoney(debt.remaining, debt.currency)}</span>
                </div>
                <p className="ew-meta">
                  Din {formatMoney(debt.amount, debt.currency)}, pe {formatDisplayDate(debt.occurred_on)}, din {debt.account_name}
                  {debt.note ? ` · ${debt.note}` : ""}
                </p>
                {write ? (
                  <div className="ew-fields">
                    <Field label="Mi-a dat înapoi">
                      <input
                        inputMode="decimal"
                        placeholder="0,00"
                        value={form.amount}
                        onChange={(event) => setBack({ ...back, [debt.id]: { ...form, amount: event.target.value } })}
                      />
                    </Field>
                    <Field label="În contul">
                      <select
                        value={form.accountId}
                        onChange={(event) => setBack({ ...back, [debt.id]: { ...form, accountId: event.target.value } })}
                      >
                        {accounts
                          .filter((account) => account.currency === debt.currency)
                          .map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Data">
                      <input
                        value={form.date}
                        placeholder="ZZ.LL.AAAA"
                        onChange={(event) => setBack({ ...back, [debt.id]: { ...form, date: event.target.value } })}
                      />
                    </Field>
                  </div>
                ) : null}
                <div className="ew-actions">
                  {write ? (
                    <button className="btn primary" type="button" disabled={pending || !form.amount.trim()} onClick={() => void repay(debt)}>
                      Mi-a dat înapoi
                    </button>
                  ) : null}
                  {remove ? (
                    <button className="btn danger" type="button" onClick={() => void erase(debt)}>
                      Șterge
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="ew-empty">
          <p>Nimeni nu îți datorează bani.</p>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <SpaceBody>{(space) => <Debts space={space} />}</SpaceBody>
    </Guard>
  );
}
