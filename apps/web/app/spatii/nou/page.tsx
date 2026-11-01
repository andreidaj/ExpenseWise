"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Guard } from "@/components/Guard";
import { Alert, Field, PageHeader } from "@/components/ui";
import { parseDisplayDate, toCurrency } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { resources } from "@/lib/resources";
import { useSpace } from "@/lib/space";
import { CURRENCIES, type SpaceKind } from "@/lib/types";

const screenCss = `
.ew-screen{width:100%;max-width:100%;min-width:0;overflow-x:hidden;display:grid;gap:16px;background:transparent;color:#F8FAFC}
.ew-screen h1{font-family:inherit;color:#F8FAFC;font-size:1.7rem;line-height:1.15;overflow-wrap:anywhere}
.ew-screen .muted,.ew-screen .page-lede,.ew-screen .field span{color:#98A4BA;max-width:100%}
.ew-screen .page-head{display:flex;flex-direction:column;align-items:stretch;gap:12px;width:100%;max-width:100%}
.ew-screen .card{background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:20px;box-shadow:none;color:#F8FAFC;max-width:100%;min-width:0;padding:16px;overflow:hidden;margin-bottom:96px}
.ew-screen .btn,.ew-screen .segment button{min-height:44px;font-family:inherit}
.ew-screen .btn.primary,.ew-screen .btn.primary:hover{background:#9585FF;border-color:#9585FF;color:#0B0F19}
.ew-screen .segment{display:flex;flex-wrap:wrap;width:100%;max-width:100%;overflow:hidden;border-radius:16px;border:1px solid rgba(255,255,255,0.07);background:rgba(11,15,25,0.55);padding:4px;gap:4px}
.ew-screen .segment button{flex:1 1 7rem;min-width:0;border-radius:12px;color:#98A4BA;white-space:normal;text-align:center;padding:8px 10px}
.ew-screen .segment button[aria-pressed="true"]{background:#9585FF;color:#0B0F19}
.ew-screen input,.ew-screen select{width:100%;max-width:100%;min-width:0;background:rgba(11,15,25,0.72);color:#F8FAFC;border:1px solid rgba(255,255,255,0.07);border-radius:14px;font-family:inherit}
.ew-screen input:focus,.ew-screen select:focus{border-color:#9585FF;outline-color:#9585FF}
.ew-screen .alert{background:rgba(11,15,25,0.45);border:1px solid rgba(255,255,255,0.07);border-radius:16px;color:#F8FAFC;overflow-wrap:anywhere}
.ew-screen .alert.error{color:#FF738A;border-color:rgba(255,115,138,0.4)}
.ew-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;width:100%;min-width:0}
.ew-end{display:flex;flex-wrap:wrap;gap:10px;width:100%}
.ew-end .btn{flex:1 1 100%;min-height:44px}
`;

function NewSpace() {
  const router = useRouter();
  const { reload, setCurrentId } = useSpace();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Exclude<SpaceKind, "personal">>("family");
  const [currency, setCurrency] = useState("RON");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await resources.createSpace({
        name: name.trim(),
        kind,
        base_currency: toCurrency(currency),
        starts_on: kind === "project" && starts.trim() ? parseDisplayDate(starts) : null,
        ends_on: kind === "project" && ends.trim() ? parseDisplayDate(ends) : null,
      });
      await reload();
      if (created) setCurrentId(created.id);
      router.push("/spatii");
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }

  return (
    <div className="ew-screen">
      <style>{screenCss}</style>
      <PageHeader title="Spațiu nou" lede="Familie sau proiect. Spațiul personal există deja." />
      <form className="card stack" onSubmit={(event) => void submit(event)}>
        {error ? <Alert>{error}</Alert> : null}
        <div className="segment" role="group" aria-label="Tip spațiu">
          <button type="button" aria-pressed={kind === "family"} onClick={() => setKind("family")}>
            Familie
          </button>
          <button type="button" aria-pressed={kind === "project"} onClick={() => setKind("project")}>
            Proiect
          </button>
        </div>
        <div className="ew-fields">
          <Field label="Nume">
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Monedă de bază">
            <input list="monede" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} required />
            <datalist id="monede">
              {CURRENCIES.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </Field>
          {kind === "project" ? (
            <>
              <Field label="Început (opțional)">
                <input placeholder="ZZ.LL.AAAA" value={starts} onChange={(event) => setStarts(event.target.value)} />
              </Field>
              <Field label="Sfârșit (opțional)">
                <input placeholder="ZZ.LL.AAAA" value={ends} onChange={(event) => setEnds(event.target.value)} />
              </Field>
            </>
          ) : null}
        </div>
        <div className="ew-end">
          <button className="btn primary" type="submit" disabled={pending}>
            {pending ? "Se creează…" : "Creează spațiul"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <NewSpace />
    </Guard>
  );
}
