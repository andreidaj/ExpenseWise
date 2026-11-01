"use client";

import { useEffect, useState } from "react";
import { Guard } from "@/components/Guard";
import { SpaceBody } from "@/components/SpaceBody";
import { Alert, Field, PageHeader } from "@/components/ui";
import { formatDisplayDate, formatMoney, parseDisplayDate, plainAmount, todayDisplay, toAmount } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { canCreateRecurring, canEditRecurring } from "@/lib/permissions";
import { resources } from "@/lib/resources";
import {
  FREQUENCY_LABEL,
  TX_KIND_LABEL,
  type Account,
  type Category,
  type Frequency,
  type RecurringRule,
  type Space,
} from "@/lib/types";

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
.ew-screen .badge.warn{background:rgba(255,115,138,0.16);color:#FF738A}
.ew-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;width:100%;min-width:0}
.ew-end{display:flex;flex-wrap:wrap;gap:10px;width:100%}
.ew-end .btn{flex:1 1 100%;min-height:44px}
.ew-list{list-style:none;margin:0;padding:0;display:grid;gap:10px;width:100%;max-width:100%;min-width:0;overflow-x:hidden}
.ew-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,46%);gap:4px 12px;align-items:start;padding:14px 16px;overflow:hidden}
.ew-name{grid-column:1;grid-row:1;color:#F8FAFC;overflow-wrap:anywhere;line-height:1.35}
.ew-amt{grid-column:2;grid-row:1;justify-self:end;align-self:start;text-align:right;font-variant-numeric:tabular-nums;white-space:normal;overflow-wrap:anywhere;max-width:100%}
.ew-meta{grid-column:1 / -1;color:#98A4BA;font-size:.85rem;overflow-wrap:anywhere}
.ew-actions{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;max-width:100%}
.ew-actions .btn{flex:1 1 8rem;min-height:44px}
.ew-flag{grid-column:1 / -1}
.ew-empty{display:grid;gap:10px;justify-items:start;padding:16px}
.ew-empty p{color:#F8FAFC}
.ew-screen #regula-noua{margin-bottom:96px}
`;

function Recurring({ space }: { space: Space }) {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [nextRun, setNextRun] = useState(todayDisplay());
  const [ends, setEnds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const visibleCategories = categories.filter((category) => !category.archived_at && category.kind === kind);
  const canCreate = canCreateRecurring(space.role);

  async function load() {
    const [nextRules, nextAccounts, nextCategories] = await Promise.all([
      resources.recurring(space.id),
      resources.accounts(space.id),
      resources.categories(space.id),
    ]);
    setRules(nextRules);
    setAccounts(nextAccounts.filter((account) => !account.archived_at));
    setCategories(nextCategories);
    setAccountId((current) => current || nextAccounts.find((account) => !account.archived_at)?.id || "");
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
    document.getElementById("regula-noua")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const account = accounts.find((item) => item.id === accountId);
    if (!account) {
      setError("Alege un cont.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body = {
        kind,
        account_id: account.id,
        category_id: categoryId,
        amount: toAmount(amount),
        currency: account.currency,
        description: description.trim(),
        frequency,
        next_run_on: parseDisplayDate(nextRun),
        ends_on: ends.trim() ? parseDisplayDate(ends) : null,
      };
      if (editingId) await resources.patchRecurring(space.id, editingId, body);
      else await resources.createRecurring(space.id, body);
      setAmount("");
      setDescription("");
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

  function beginEdit(rule: RecurringRule) {
    setEditingId(rule.id);
    setKind(rule.kind);
    setAccountId(rule.account_id);
    setCategoryId(rule.category_id);
    setAmount(plainAmount(rule.amount));
    setDescription(rule.description || "");
    setFrequency(rule.frequency);
    setNextRun(formatDisplayDate(rule.next_run_on));
    setEnds(rule.ends_on ? formatDisplayDate(rule.ends_on) : "");
    setOpen(true);
  }

  async function toggle(rule: RecurringRule) {
    setError(null);
    try {
      await resources.patchRecurring(space.id, rule.id, { paused: !rule.paused_at });
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function remove(rule: RecurringRule) {
    if (!window.confirm("Ștergi regula? Tranzacțiile deja create rămân.")) return;
    setError(null);
    try {
      await resources.deleteRecurring(space.id, rule.id);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="ew-screen">
      <style>{screenCss}</style>
      <PageHeader
        title="Recurențe"
        lede="La deschiderea spațiului se generează scadențele lipsă, o singură dată pe zi."
        action={
          canCreate ? (
            <button
              className="btn primary"
              type="button"
              aria-expanded={open}
              onClick={() => {
                if (open) closeForm();
                else {
                  setEditingId(null);
                  setAmount("");
                  setDescription("");
                  setEnds("");
                  setNextRun(todayDisplay());
                  setOpen(true);
                }
              }}
            >
              {open ? "Închide" : "Regulă nouă"}
            </button>
          ) : null
        }
      />
      {error ? <Alert>{error}</Alert> : null}
      {!ready ? <p className="muted">Se încarcă recurențele…</p> : null}
      {ready && rules.length ? (
        <ul className="ew-list">
          {rules.map((rule) => (
            <li key={rule.id} className="ew-row">
              <div className="ew-name">{rule.description || TX_KIND_LABEL[rule.kind]}</div>
              <div className="ew-amt" style={{ color: rule.kind === "expense" ? "#FF738A" : "#4EE0B5" }}>
                {formatMoney(rule.amount, rule.currency)}
              </div>
              <div className="ew-meta">
                {rule.description ? `${TX_KIND_LABEL[rule.kind]} · ` : ""}
                {FREQUENCY_LABEL[rule.frequency]} · următoarea {formatDisplayDate(rule.next_run_on)}
              </div>
              {rule.paused_at ? (
                <div className="ew-flag">
                  <span className="badge warn">Oprită</span>
                </div>
              ) : null}
              {canEditRecurring(space.role) ? (
                <div className="ew-actions">
                  <button className="btn ghost" type="button" onClick={() => beginEdit(rule)}>
                    Modifică
                  </button>
                  <button className="btn ghost" type="button" onClick={() => void toggle(rule)}>
                    {rule.paused_at ? "Reia" : "Oprește"}
                  </button>
                  <button className="btn danger" type="button" onClick={() => void remove(rule)}>
                    Șterge
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {ready && !error && !rules.length ? (
        <div className="ew-empty">
          <p>Nicio regulă recurentă.</p>
          {canCreate ? (
            <button className="btn ghost" type="button" onClick={() => setOpen(true)}>
              Regulă nouă
            </button>
          ) : null}
        </div>
      ) : null}
      {open && (editingId ? canEditRecurring(space.role) : canCreate) ? (
        <form id="regula-noua" className="card stack" style={{ scrollMarginTop: 84 }} onSubmit={(event) => void submit(event)}>
          <h2>{editingId ? "Modifică regula" : "Regulă nouă"}</h2>
          {!canEditRecurring(space.role) ? <p className="muted">Poți crea regula. Oprirea și ștergerea sunt pentru administrator.</p> : null}
          <div className="ew-fields">
            <Field label="Tip">
              <select
                value={kind}
                onChange={(event) => {
                  const next = event.target.value as "expense" | "income";
                  setKind(next);
                  if (!categories.some((category) => category.id === categoryId && category.kind === next && !category.archived_at)) {
                    setCategoryId("");
                  }
                }}
              >
                <option value="expense">Cheltuială</option>
                <option value="income">Venit</option>
              </select>
            </Field>
            <Field label="Sumă">
              <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
            </Field>
            <Field label="Cont">
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
                <option value="">Alege</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.currency}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Categorie">
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
                <option value="">Alege</option>
                {visibleCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Frecvență">
              <select value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)}>
                <option value="weekly">Săptămânal</option>
                <option value="monthly">Lunar</option>
                <option value="yearly">Anual</option>
              </select>
            </Field>
            <Field label="Următoarea scadență">
              <input placeholder="ZZ.LL.AAAA" value={nextRun} onChange={(event) => setNextRun(event.target.value)} required />
            </Field>
            <Field label="Se oprește la (opțional)">
              <input placeholder="ZZ.LL.AAAA" value={ends} onChange={(event) => setEnds(event.target.value)} />
            </Field>
            <Field label="Descriere">
              <input value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
          </div>
          <div className="ew-end">
            <button className="btn ghost" type="button" onClick={closeForm}>
              Anulează
            </button>
            <button className="btn primary" type="submit" disabled={pending}>
              {pending ? "Se salvează…" : editingId ? "Salvează" : "Adaugă regula"}
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
      <SpaceBody>{(space) => <Recurring space={space} />}</SpaceBody>
    </Guard>
  );
}
