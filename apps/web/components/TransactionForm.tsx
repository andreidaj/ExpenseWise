"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Field } from "@/components/ui";
import { formatDisplayDate, parseDisplayDate, todayDisplay, toAmount, toRate } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { resources } from "@/lib/resources";
import { CURRENCIES, TX_KIND_LABEL, type Account, type Category, type Goal, type Transaction, type TxKind } from "@/lib/types";

type Props = {
  spaceId: string;
  baseCurrency: string;
  accounts: Account[];
  categories: Category[];
  goals: Goal[];
  initial?: Transaction | null;
  readOnly?: boolean;
  canDelete?: boolean;
};

const formCss = `
.ew-tx-form{width:100%;max-width:100%;min-width:0;margin-bottom:96px;overflow-x:hidden;background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:20px;box-shadow:none;color:#F8FAFC;padding:16px;display:grid;gap:14px}
.ew-tx-form h1,.ew-tx-form h2,.ew-tx-form .ew-amount{font-family:inherit}
.ew-tx-form .muted,.ew-tx-form .fx,.ew-tx-form .field span{color:#98A4BA}
.ew-tx-form .field{min-width:0}
.ew-tx-form .btn,.ew-tx-form .segment button{min-height:44px;font-family:inherit}
.ew-tx-form .btn.primary,.ew-tx-form .btn.primary:hover{background:#9585FF;border-color:#9585FF;color:#0B0F19}
.ew-tx-form .btn.danger,.ew-tx-form .btn.danger:hover{background:transparent;color:#FF738A;border-color:rgba(255,115,138,0.45)}
.ew-tx-form .segment{display:flex;flex-wrap:wrap;width:100%;max-width:100%;overflow:hidden;border-radius:16px;border:1px solid rgba(255,255,255,0.07);background:rgba(11,15,25,0.55);padding:4px;gap:4px}
.ew-tx-form .segment button{flex:1 1 6.5rem;min-width:0;border:0;border-radius:12px;color:#98A4BA;white-space:normal;text-align:center;padding:8px 10px;background:transparent}
.ew-tx-form .segment button[aria-pressed="true"]{background:#9585FF;color:#0B0F19}
.ew-tx-form input,.ew-tx-form select,.ew-tx-form textarea{width:100%;max-width:100%;min-width:0;background:rgba(11,15,25,0.72);color:#F8FAFC;border:1px solid rgba(255,255,255,0.07);border-radius:14px;font-family:inherit}
.ew-tx-form input:focus,.ew-tx-form select:focus,.ew-tx-form textarea:focus{border-color:#9585FF;outline-color:#9585FF}
.ew-tx-form .ew-amount{font-size:clamp(1.8rem,8vw,2.4rem);line-height:1.1;min-height:76px;padding:12px 14px;font-variant-numeric:tabular-nums;text-align:right;letter-spacing:-.03em}
.ew-tx-form .alert{background:rgba(11,15,25,0.45);border:1px solid rgba(255,255,255,0.07);border-radius:16px;color:#F8FAFC;overflow-wrap:anywhere}
.ew-tx-form .alert.error{color:#FF738A;border-color:rgba(255,115,138,0.4)}
.ew-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;width:100%;min-width:0}
.ew-end{display:flex;flex-direction:column;gap:10px;width:100%;margin-top:4px}
.ew-end .btn{width:100%;min-height:44px}
`;

export function TransactionForm({
  spaceId,
  baseCurrency,
  accounts,
  categories,
  goals,
  initial,
  readOnly = false,
  canDelete = false,
}: Props) {
  const router = useRouter();
  const activeAccounts = accounts.filter((account) => !account.archived_at);
  const [kind, setKind] = useState<TxKind>(initial?.kind ?? "expense");
  const [accountId, setAccountId] = useState(initial?.account_id || activeAccounts[0]?.id || "");
  const [counterId, setCounterId] = useState(initial?.counter_account_id || "");
  const [categoryId, setCategoryId] = useState(initial?.category_id || "");
  const [goalId, setGoalId] = useState(initial?.goal_id || "");
  const [amount, setAmount] = useState(initial ? initial.amount : "");
  const [counterAmount, setCounterAmount] = useState(initial?.counter_amount || "");
  const [date, setDate] = useState(initial?.occurred_on ? formatDisplayDate(initial.occurred_on) : todayDisplay());
  const [description, setDescription] = useState(initial?.description || "");
  const [fx, setFx] = useState(initial?.fx_source === "manual" ? initial.fx_rate || "" : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const account = activeAccounts.find((item) => item.id === accountId) || accounts.find((item) => item.id === accountId);
  const counter = activeAccounts.find((item) => item.id === counterId);
  const filteredCategories = useMemo(
    () => categories.filter((category) => !category.archived_at && category.kind === kind),
    [categories, kind],
  );

  useEffect(() => {
    if (kind !== "transfer" && categoryId && !filteredCategories.some((category) => category.id === categoryId)) {
      setCategoryId(filteredCategories[0]?.id || "");
    }
  }, [categoryId, filteredCategories, kind]);

  async function submit() {
    if (!account) {
      setError("Alege un cont.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        kind,
        amount: toAmount(amount),
        currency: account.currency,
        occurred_on: parseDisplayDate(date),
        account_id: account.id,
        description: description.trim(),
        goal_id: goalId || null,
      };
      if (fx.trim()) {
        payload.fx_rate = toRate(fx);
        payload.fx_source = "manual";
      }
      if (kind === "transfer") {
        if (!counter || counter.id === account.id) throw new Error("Alege un cont destinație diferit.");
        payload.counter_account_id = counter.id;
        payload.counter_currency = counter.currency;
        payload.category_id = null;
        payload.counter_amount = counter.currency === account.currency ? payload.amount : toAmount(counterAmount);
      } else {
        if (!categoryId) throw new Error("Alege o categorie.");
        payload.category_id = categoryId;
        payload.counter_account_id = null;
      }
      const saved = initial
        ? await resources.patchTransaction(spaceId, initial.id, payload)
        : await resources.createTransaction(spaceId, payload);
      if (!saved) throw new Error("Tranzacția nu a fost confirmată de server.");
      router.push("/tranzactii");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!initial || !window.confirm("Ștergi această tranzacție? Dispare din solduri și rapoarte.")) return;
    setPending(true);
    setError(null);
    try {
      await resources.deleteTransaction(spaceId, initial.id);
      router.push("/tranzactii");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  const needsFx = Boolean(account && account.currency !== baseCurrency);

  return (
    <form
      className="ew-tx-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!readOnly) void submit();
      }}
    >
      <style>{formCss}</style>
      <Field label={kind === "transfer" ? "Sumă ieșită" : "Sumă"}>
        <input
          className="ew-amount"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          disabled={readOnly}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </Field>
      <div className="segment" role="group" aria-label="Tip tranzacție">
        {(["expense", "income", "transfer"] as TxKind[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            disabled={readOnly || pending}
            onClick={() => setKind(value)}
          >
            {TX_KIND_LABEL[value]}
          </button>
        ))}
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <div className="ew-fields">
        <Field label="Data">
          <input inputMode="numeric" placeholder="ZZ.LL.AAAA" value={date} disabled={readOnly} onChange={(event) => setDate(event.target.value)} required />
        </Field>
        <Field label={kind === "transfer" ? "Din contul" : "Cont"}>
          <select value={accountId} disabled={readOnly} onChange={(event) => setAccountId(event.target.value)} required>
            <option value="">Alege</option>
            {activeAccounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.currency}
              </option>
            ))}
          </select>
        </Field>
        {kind === "transfer" ? (
          <Field label="În contul">
            <select value={counterId} disabled={readOnly} onChange={(event) => setCounterId(event.target.value)} required>
              <option value="">Alege</option>
              {activeAccounts
                .filter((item) => item.id !== accountId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.currency}
                  </option>
                ))}
            </select>
          </Field>
        ) : (
          <Field label="Categorie">
            <select value={categoryId} disabled={readOnly} onChange={(event) => setCategoryId(event.target.value)} required>
              <option value="">Alege</option>
              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {kind === "transfer" && counter && account && counter.currency !== account.currency ? (
          <Field label={`Sumă intrată (${counter.currency})`}>
            <input inputMode="decimal" placeholder="0,00" value={counterAmount} disabled={readOnly} onChange={(event) => setCounterAmount(event.target.value)} required />
          </Field>
        ) : null}
        <Field label="Obiectiv">
          <select value={goalId} disabled={readOnly} onChange={(event) => setGoalId(event.target.value)}>
            <option value="">Fără obiectiv</option>
            {goals
              .filter((goal) => !goal.archived_at)
              .map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.name}
                </option>
              ))}
          </select>
        </Field>
        {needsFx ? (
          <Field label={`Curs manual către ${baseCurrency} (opțional)`}>
            <input inputMode="decimal" placeholder="Frankfurter dacă îl lași gol" value={fx} disabled={readOnly} onChange={(event) => setFx(event.target.value)} />
          </Field>
        ) : null}
        <Field label="Descriere">
          <textarea value={description} disabled={readOnly} onChange={(event) => setDescription(event.target.value)} />
        </Field>
      </div>
      {account ? <p className="muted">Moneda tranzacției este {account.currency === "LEI" ? "RON" : account.currency}. Monede cunoscute: {CURRENCIES.join(", ")}.</p> : null}
      {initial?.fx_rate ? (
        <p className="fx">
          Curs salvat: {initial.fx_rate}
          {initial.fx_source ? ` · ${initial.fx_source === "frankfurter" ? "Frankfurter" : initial.fx_source}` : ""}
          {initial.fx_rate_date ? ` · ${formatDisplayDate(initial.fx_rate_date)}` : ""}
        </p>
      ) : null}
      {readOnly ? null : (
        <div className="ew-end">
          {initial && canDelete ? (
            <button className="btn danger" type="button" disabled={pending} onClick={() => void remove()}>
              Șterge
            </button>
          ) : null}
          <button className="btn primary" type="submit" disabled={pending}>
            {pending ? "Se salvează…" : initial ? "Salvează" : "Adaugă"}
          </button>
        </div>
      )}
    </form>
  );
}
