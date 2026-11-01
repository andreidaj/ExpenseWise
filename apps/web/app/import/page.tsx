"use client";

import { Fraunces } from "next/font/google";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Guard } from "@/components/Guard";
import { SpaceBody } from "@/components/SpaceBody";
import { formatDisplayDate, formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { mappedText } from "@/lib/normalize";
import { canWriteTransactions } from "@/lib/permissions";
import { resources } from "@/lib/resources";
import { readSpreadsheet, type SheetTable } from "@/lib/sheet";
import type { Account, Category, ImportPreview, Space } from "@/lib/types";

const display = Fraunces({
  subsets: ["latin", "latin-ext"],
  weight: "500",
  display: "swap",
});

const FIELDS: { key: string; label: string; required?: boolean; guess: string[] }[] = [
  { key: "occurred_on", label: "Data", required: true, guess: ["data", "date", "zi"] },
  { key: "amount", label: "Sumă", required: true, guess: ["suma", "sumă", "amount", "valoare"] },
  { key: "currency", label: "Monedă", guess: ["moneda", "monedă", "currency", "valuta"] },
  { key: "description", label: "Descriere", guess: ["descriere", "detalii", "memo", "explanation"] },
  { key: "account", label: "Cont", guess: ["cont", "account"] },
  { key: "category", label: "Categorie", guess: ["categorie", "category"] },
  { key: "kind", label: "Tip", guess: ["tip", "fel", "kind"] },
];

function guess(headers: string[], needles: string[]): string {
  return headers.find((header) => needles.some((needle) => header.toLowerCase().includes(needle))) || "";
}

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

function ImportScreen({ space }: { space: Space }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<SheetTable | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [kind, setKind] = useState("expense");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([resources.accounts(space.id), resources.categories(space.id)])
      .then(([nextAccounts, nextCategories]) => {
        setAccounts(nextAccounts.filter((account) => !account.archived_at));
        setCategories(nextCategories.filter((category) => !category.archived_at));
        setAccountId(nextAccounts.find((account) => !account.archived_at)?.id || "");
      })
      .catch((cause) => setError(errorMessage(cause)));
  }, [space.id]);

  function clearChosenFile() {
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onFile(next: File | null) {
    setPreview(null);
    setInfo(null);
    setError(null);
    if (!next) {
      clearChosenFile();
      setTable(null);
      return;
    }
    if (!/\.(csv|xlsx)$/i.test(next.name)) {
      clearChosenFile();
      setTable(null);
      setError("Folosește un CSV (.csv) sau un Excel (.xlsx).");
      return;
    }
    setFile(next);
    try {
      const parsed = await readSpreadsheet(next);
      if (!parsed.headers.length) throw new Error("Fișierul nu are coloane.");
      setTable(parsed);
      const nextMapping: Record<string, string> = {};
      for (const field of FIELDS) nextMapping[field.key] = guess(parsed.headers, field.guess);
      setMapping(nextMapping);
    } catch (cause) {
      setTable(null);
      setError(errorMessage(cause));
    }
  }

  async function requestPreview(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !table) return;
    if (!mapping.occurred_on || !mapping.amount) {
      setError("Asociază cel puțin data și suma.");
      return;
    }
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mapping", JSON.stringify(mapping));
      if (accountId) form.append("account_id", accountId);
      if (categoryId) form.append("category_id", categoryId);
      form.append("kind", kind);
      const result = await resources.previewImport(space.id, form);
      if (!result.id) throw new Error("Serverul nu a întors lotul de previzualizare.");
      setPreview(result);
      const initial: Record<string, boolean> = {};
      for (const row of result.rows) initial[row.id] = !row.duplicate_of && row.status !== "skipped";
      setChecked(initial);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    const include = preview.rows.filter((row) => checked[row.id]).map((row) => row.id);
    if (!include.length) {
      setError("Bifează cel puțin un rând.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await resources.confirmImport(space.id, preview.id, include);
      setInfo(`Au fost trimise ${include.length} rânduri. Duplicatele nebifate rămân afară.`);
      setPreview(null);
      clearChosenFile();
      setTable(null);
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
        <h1 className={display.className}>Extras din bancă</h1>
        <p className="ew-lede">
          Aici adaugi cheltuielile și veniturile dintr-un extras de card sau de cont. Fișierul are nevoie de dată și de o sumă pozitivă, pe care le asociezi coloanelor. Dacă există o coloană de tip, o folosești ca să deosebești cheltuiala de venit. Fără ea, rândul este cheltuială. Tranzacțiile apar abia după previzualizare și confirmare.
        </p>
      </header>
      {!canWriteTransactions(space.role) ? (
        <p className="ew-error" role="alert">
          Rolul tău nu poate adăuga un extras.
        </p>
      ) : (
        <>
          {error ? (
            <p className="ew-error" role="alert">
              {calm(error)}
            </p>
          ) : null}
          {info ? (
            <p className="ew-ok" role="status">
              {info}
            </p>
          ) : null}
          <form className="ew-panel" onSubmit={(event) => void requestPreview(event)}>
            <div className="ew-file">
              <p className="ew-note">Tipuri suportate: CSV (.csv) și Excel (.xlsx).</p>
              <label className="ew-primary ew-choose">
                {file ? "Schimbă fișierul" : "Alege fișierul"}
                <input
                  ref={fileInput}
                  className="ew-picker"
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
                />
              </label>
              {file ? <p className="ew-file-name">{file.name}</p> : null}
            </div>
            {table ? (
              <>
                <div className="ew-split">
                  {FIELDS.map((field) => (
                    <Field key={field.key} label={field.required ? `${field.label} *` : field.label}>
                      <select value={mapping[field.key] || ""} onChange={(event) => setMapping({ ...mapping, [field.key]: event.target.value })}>
                        <option value="">Nu folosi</option>
                        {table.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ))}
                  <Field label="Cont implicit">
                    <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Categorie implicită">
                    <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                      <option value="">Din coloană</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tip implicit">
                    <select value={kind} onChange={(event) => setKind(event.target.value)}>
                      <option value="expense">Cheltuială</option>
                      <option value="income">Venit</option>
                    </select>
                  </Field>
                </div>
                <p className="ew-note">Primele rânduri din fișier, înainte de verificarea duplicatelor.</p>
                <div className="ew-table">
                  <table>
                    <thead>
                      <tr>
                        {table.headers.map((header) => (
                          <th key={header}>{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.slice(0, 3).map((row, index) => (
                        <tr key={index}>
                          {table.headers.map((header) => (
                            <td key={header}>{row[header]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className="ew-primary" type="submit" disabled={pending}>
                  {pending ? "Se verifică…" : "Previzualizează"}
                </button>
              </>
            ) : null}
          </form>
          {preview ? (
            <section className="ew-panel">
              <h2 className={display.className}>Previzualizare {preview.filename}</h2>
              <p className="ew-note">Duplicatele sunt debifate. Bifează-le doar dacă vrei să le adaugi oricum.</p>
              <div className="ew-table">
                <table>
                  <thead>
                    <tr>
                      <th>Adaugă</th>
                      <th>Rând</th>
                      <th>Data</th>
                      <th>Sumă</th>
                      <th>Descriere</th>
                      <th>Duplicat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => {
                      const date = mappedText(row.mapped, ["occurred_on", "date", "data"]);
                      const amount = mappedText(row.mapped, ["amount", "suma"]);
                      const currency = mappedText(row.mapped, ["currency", "moneda"]) || "RON";
                      const description = mappedText(row.mapped, ["description", "descriere"]);
                      return (
                        <tr key={row.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={Boolean(checked[row.id])}
                              aria-label={`Adaugă rândul ${row.row_number}`}
                              onChange={(event) => setChecked({ ...checked, [row.id]: event.target.checked })}
                            />
                          </td>
                          <td>{row.row_number}</td>
                          <td>{date.includes("-") ? formatDisplayDate(date) : date}</td>
                          <td>{amount ? formatMoney(amount, currency) : "—"}</td>
                          <td>{description || "—"}</td>
                          <td>{row.duplicate_of ? <span className="ew-flag">Duplicat</span> : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button className="ew-primary ew-confirm" type="button" disabled={pending} onClick={() => void confirm()}>
                Confirmă extrasul
              </button>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <SpaceBody>{(space) => <ImportScreen space={space} />}</SpaceBody>
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
.ew-page h2 {
  margin: 0;
  font-size: 1.28rem;
  font-weight: 500;
  letter-spacing: -0.02em;
  color: #F8FAFC;
}
.ew-lede { margin: 0; max-width: 40rem; color: #98A4BA; line-height: 1.55; overflow-wrap: anywhere; }
.ew-note, .ew-error, .ew-ok { margin: 0; line-height: 1.5; overflow-wrap: anywhere; background: none; border: 0; padding: 0; box-shadow: none; }
.ew-note { color: #98A4BA; font-size: 0.95rem; }
.ew-error { color: #FF738A; font-size: 0.92rem; }
.ew-ok { color: #9EE6C3; font-size: 0.92rem; }
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
.ew-file { display: grid; gap: 10px; min-width: 0; }
.ew-file .ew-choose {
  position: relative;
  width: 100%;
  justify-self: stretch;
  cursor: pointer;
}
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
  box-shadow: none;
}
.ew-file-name {
  margin: 0;
  color: inherit;
  font-size: 0.95rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.ew-page input[type="checkbox"] {
  width: 20px;
  height: 20px;
  min-height: 20px;
  padding: 0;
  accent-color: #9585FF;
  box-shadow: none;
}
.ew-primary, .ew-quiet, .ew-danger {
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
.ew-primary:disabled { opacity: 0.55; cursor: not-allowed; }
.ew-confirm { margin-bottom: 96px; }
.ew-table {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  background: #0B0F19;
  font-size: 0.92rem;
}
.ew-table table { width: max-content; min-width: 100%; border-collapse: collapse; }
.ew-table th, .ew-table td {
  border-bottom: 1px solid rgba(255,255,255,0.07);
  color: #F8FAFC;
  white-space: nowrap;
  background: transparent;
}
.ew-table th { color: #98A4BA; font-weight: 600; }
.ew-table tbody tr:hover td { background: rgba(255,255,255,0.04); }
.ew-flag {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.07);
  color: #FF738A;
  font-size: 0.82rem;
  background: transparent;
}
.ew-page :focus-visible { outline: 2px solid #9585FF; outline-offset: 2px; }
@media (min-width: 861px) {
  .ew-split { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ew-primary, .ew-quiet { width: auto; justify-self: start; }
  .ew-confirm { margin-bottom: 0; }
}
`;
