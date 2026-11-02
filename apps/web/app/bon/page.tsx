"use client";

import Link from "next/link";
import { Fraunces } from "next/font/google";
import { useEffect, useState, type ReactNode } from "react";
import { Guard } from "@/components/Guard";
import { SpaceBody } from "@/components/SpaceBody";
import { asRecord, asString, formatDisplayDate, parseDisplayDate, toAmount, toCurrency, toRate } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { canWriteTransactions } from "@/lib/permissions";
import { resources } from "@/lib/resources";
import { CURRENCIES, type Account, type Category, type ReceiptDraft, type Space } from "@/lib/types";

const display = Fraunces({
  subsets: ["latin", "latin-ext"],
  weight: "500",
  display: "swap",
});

function calm(message: string): string {
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message)) {
    return "Nu am putut vorbi cu serverul. Verifică legătura și încearcă din nou.";
  }
  return message;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ew-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ReceiptScreen({ space }: { space: Space }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState("");
  const [total, setTotal] = useState("");
  const [currency, setCurrency] = useState(space.base_currency || "RON");
  const [description, setDescription] = useState("");
  const [fx, setFx] = useState("");
  const [lines, setLines] = useState<{ description: string; amount: string }[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    Promise.all([resources.accounts(space.id), resources.categories(space.id)])
      .then(([nextAccounts, nextCategories]) => {
        const active = nextAccounts.filter((account) => !account.archived_at);
        setAccounts(active);
        setCategories(nextCategories.filter((category) => category.kind === "expense" && !category.archived_at));
        setAccountId(active[0]?.id || "");
      })
      .catch((cause) => setError(errorMessage(cause)));
  }, [space.id]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function applyDraft(next: ReceiptDraft) {
    setDraft(next);
    setMerchant(next.merchant);
    setDate(next.occurred_on ? formatDisplayDate(next.occurred_on) : "");
    setTotal(next.total_amount && next.total_amount !== "0" ? next.total_amount : "");
    setCurrency(next.currency || space.base_currency || "RON");
    setDescription(next.merchant);
    setLines(next.lines);
    setSavedId(null);
  }

  async function upload(file: File) {
    setPending(true);
    setError(null);
    setSavedId(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const form = new FormData();
      form.append("file", file);
      applyDraft(await resources.uploadReceipt(space.id, form));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setPending(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        account_id: accountId,
        category_id: categoryId,
        merchant: merchant.trim(),
        occurred_on: parseDisplayDate(date),
        total_amount: toAmount(total),
        currency: toCurrency(currency),
        description: description.trim() || merchant.trim(),
        lines: lines.map((line) => ({ description: line.description, amount: line.amount })),
      };
      if (fx.trim()) {
        payload.fx_rate = toRate(fx);
        payload.fx_source = "manual";
      }
      const result = await resources.saveReceipt(space.id, draft.id, payload);
      const record = asRecord(result);
      setSavedId(asString(record.id) || asString(asRecord(record.transaction).id));
      setDraft(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ew-page">
      <style>{pageCss}</style>
      <header>
        <h1 className={display.className}>Bon</h1>
        <p className="ew-lede">
          Încarci o poză de pe acest dispozitiv, iar draftul îți aduce comerciantul, data și totalul. Corectezi ce trebuie, apoi salvezi tranzacția; imaginea nu rămâne păstrată.
        </p>
      </header>
      {!canWriteTransactions(space.role) ? (
        <p className="ew-error" role="alert">
          Rolul tău nu poate salva bonuri.
        </p>
      ) : (
        <>
          {error ? (
            <p className="ew-error" role="alert">
              {calm(error)}
            </p>
          ) : null}
          {savedId ? (
            <p className="ew-ok" role="status">
              Tranzacția a fost salvată. <Link href={`/tranzactii/${savedId}`}>Deschide rândul</Link>
            </p>
          ) : null}
          <section className="ew-panel">
            <div className="ew-photo">
              <div className="ew-photo-phone">
                <label className={pending ? "ew-primary is-off" : "ew-primary"}>
                  Fă o poză
                  <input
                    className="ew-picker"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={pending}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void upload(file);
                    }}
                  />
                </label>
                <label className={pending ? "ew-quiet is-off" : "ew-quiet"}>
                  Alege din telefon
                  <input
                    className="ew-picker"
                    type="file"
                    accept="image/*"
                    disabled={pending}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void upload(file);
                    }}
                  />
                </label>
              </div>
              <label className={pending ? "ew-primary ew-photo-desk is-off" : "ew-primary ew-photo-desk"}>
                Alege un bon
                <input
                  className="ew-picker"
                  type="file"
                  accept="image/*"
                  disabled={pending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void upload(file);
                  }}
                />
              </label>
            </div>
            {pending && !draft ? <p className="ew-note">Se citește bonul…</p> : null}
            {previewUrl ? <img className="ew-shot" src={previewUrl} alt="Previzualizarea bonului, doar pe acest dispozitiv" /> : null}
          </section>
          {draft ? (
            <form className="ew-panel" onSubmit={(event) => void save(event)}>
              <h2 className={display.className}>Draft</h2>
              <div className="ew-split">
                <Field label="Comerciant">
                  <input value={merchant} onChange={(event) => setMerchant(event.target.value)} />
                </Field>
                <Field label="Data">
                  <input placeholder="ZZ.LL.AAAA" value={date} onChange={(event) => setDate(event.target.value)} required />
                </Field>
                <Field label="Total">
                  <input inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} required />
                </Field>
                <Field label="Monedă">
                  <input list="monede-bon" value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} required />
                </Field>
                <datalist id="monede-bon">
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code} />
                  ))}
                </datalist>
                <Field label="Cont">
                  <select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Categorie">
                  <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
                    <option value="">Alege</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {currency && currency !== space.base_currency ? (
                  <Field label={`Curs manual către ${space.base_currency} (opțional)`}>
                    <input value={fx} onChange={(event) => setFx(event.target.value)} />
                  </Field>
                ) : null}
              </div>
              <Field label="Descriere">
                <input value={description} onChange={(event) => setDescription(event.target.value)} />
              </Field>
              <div className="ew-lines">
                <h3 className={display.className}>Linii</h3>
                {lines.map((line, index) => (
                  <div key={index} className="ew-split">
                    <input
                      aria-label="Descriere linie"
                      value={line.description}
                      onChange={(event) => {
                        const next = [...lines];
                        next[index] = { ...line, description: event.target.value };
                        setLines(next);
                      }}
                    />
                    <input
                      aria-label="Sumă linie"
                      value={line.amount}
                      onChange={(event) => {
                        const next = [...lines];
                        next[index] = { ...line, amount: event.target.value };
                        setLines(next);
                      }}
                    />
                  </div>
                ))}
                <button className="ew-quiet" type="button" onClick={() => setLines([...lines, { description: "", amount: "" }])}>
                  Adaugă o linie
                </button>
              </div>
              <button className="ew-primary ew-confirm" type="submit" disabled={pending}>
                {pending ? "Se salvează…" : "Salvează tranzacția"}
              </button>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <SpaceBody>{(space) => <ReceiptScreen space={space} />}</SpaceBody>
    </Guard>
  );
}

const pageCss = `
.ew-page, .ew-page * { box-sizing: border-box; }
body:has(.ew-page) { margin: 0; }
.ew-page {
  display: grid;
  gap: 22px;
  min-width: 0;
  max-width: 100%;
  overflow-x: clip;
  color: #F8FAFC;
  color-scheme: dark;
  background: #0B0F19;
}
.ew-page header { display: grid; gap: 8px; min-width: 0; }
.ew-page h1 {
  margin: 0;
  font-size: clamp(1.7rem, 7vw, 2.15rem);
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1.12;
  color: #F8FAFC;
  overflow-wrap: anywhere;
}
.ew-page h2, .ew-page h3 {
  margin: 0;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: #F8FAFC;
}
.ew-page h2 { font-size: 1.28rem; }
.ew-page h3 { font-size: 1.05rem; }
.ew-lede { margin: 0; max-width: 40rem; color: #98A4BA; line-height: 1.55; overflow-wrap: anywhere; }
.ew-note, .ew-error, .ew-ok { margin: 0; line-height: 1.5; overflow-wrap: anywhere; background: none; border: 0; padding: 0; box-shadow: none; }
.ew-note { color: #98A4BA; font-size: 0.95rem; }
.ew-error { color: #FF738A; font-size: 0.92rem; }
.ew-ok { color: #9EE6C3; font-size: 0.92rem; }
.ew-ok a { color: #B1A5FF; }
.ew-ok a:hover { color: #9585FF; }
.ew-panel {
  background: #192132;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 20px;
  box-shadow: none;
  padding: 20px;
  display: grid;
  gap: 14px;
  min-width: 0;
  max-width: 100%;
}
.ew-split { display: grid; gap: 14px; grid-template-columns: 1fr; min-width: 0; }
.ew-lines { display: grid; gap: 12px; min-width: 0; }
.ew-field { display: grid; gap: 6px; min-width: 0; }
.ew-field > span { font-size: 0.86rem; color: #98A4BA; }
.ew-page input:not([type="checkbox"]),
.ew-page select {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 48px;
  border: 1px solid rgba(255,255,255,0.07);
  background: #0B0F19;
  color: #F8FAFC;
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: none;
  font-family: inherit;
  font-size: 16px;
}
.ew-photo { display: grid; gap: 10px; }
.ew-photo-phone { display: grid; gap: 10px; }
.ew-photo .ew-photo-desk { display: none; }
@media (hover: hover) and (pointer: fine) {
  .ew-photo-phone { display: none; }
  .ew-photo .ew-photo-desk { display: inline-flex; }
}
.ew-photo .ew-primary, .ew-photo .ew-quiet { position: relative; }
.ew-page input.ew-picker {
  position: absolute;
  width: 1px;
  height: 1px;
  min-height: 0;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.ew-primary, .ew-quiet {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: stretch;
  width: 100%;
  min-height: 48px;
  padding: 0 16px;
  border-radius: 14px;
  box-shadow: none;
  font-family: inherit;
  font-size: 0.98rem;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  text-decoration: none;
}
.ew-primary { border: 1px solid #9585FF; background: #9585FF; color: #F8FAFC; }
.ew-primary:hover { background: #B1A5FF; border-color: #B1A5FF; color: #F8FAFC; }
.ew-quiet { border: 1px solid rgba(255,255,255,0.07); background: transparent; color: #F8FAFC; }
.ew-quiet:hover { border-color: #B1A5FF; color: #F8FAFC; }
.ew-primary:disabled, .ew-quiet:disabled, .ew-primary.is-off, .ew-quiet.is-off { opacity: 0.55; cursor: not-allowed; }
.ew-primary.is-off, .ew-quiet.is-off { pointer-events: none; }
.ew-confirm { margin-bottom: 96px; }
.ew-shot {
  display: block;
  width: 100%;
  max-width: min(100%, 360px);
  height: auto;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.07);
  box-shadow: none;
}
.ew-page :focus-visible { outline: 2px solid #9585FF; outline-offset: 2px; }
@media (min-width: 861px) {
  .ew-split { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ew-primary, .ew-quiet { width: auto; justify-self: start; }
  .ew-confirm { margin-bottom: 0; }
}
`;
