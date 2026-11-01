"use client";

import { useEffect, useState } from "react";
import { Guard } from "@/components/Guard";
import { MoneySummary } from "@/components/MoneySummary";
import { ReportChart } from "@/components/ReportChart";
import { SpaceBody } from "@/components/SpaceBody";
import { Alert, Field, PageHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate, monthStartDisplay, parseDisplayDate, todayDisplay, yearStartIso } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { resources } from "@/lib/resources";
import type { ReportModel, Space } from "@/lib/types";

const screenCss = `
.ew-screen{width:100%;max-width:100%;min-width:0;overflow-x:hidden;display:grid;gap:16px;background:transparent;color:#F8FAFC}
.ew-screen h1,.ew-screen h2,.ew-screen .money-figure{font-family:inherit;color:#F8FAFC}
.ew-screen h1{font-size:1.7rem;line-height:1.15;overflow-wrap:anywhere}
.ew-screen h2{font-size:1.05rem;line-height:1.3;overflow-wrap:anywhere}
.ew-screen .muted,.ew-screen .page-lede,.ew-screen .fx,.ew-screen .field span,.ew-screen .empty{color:#98A4BA}
.ew-screen .page-head{display:flex;flex-direction:column;align-items:stretch;gap:12px;width:100%;max-width:100%}
.ew-screen .page-lede{max-width:100%}
.ew-screen .card,.ew-screen .money{
  background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:20px;box-shadow:none;color:#F8FAFC;max-width:100%;min-width:0
}
.ew-screen .card{padding:16px;overflow:hidden}
.ew-screen .btn{min-height:44px;font-family:inherit}
.ew-screen .btn.primary,.ew-screen .btn.primary:hover{background:#9585FF;border-color:#9585FF;color:#0B0F19}
.ew-screen .btn.ghost,.ew-screen .btn.ghost:hover{background:transparent;color:#F8FAFC;border-color:rgba(255,255,255,0.07)}
.ew-screen input,.ew-screen select{width:100%;max-width:100%;min-width:0;background:rgba(11,15,25,0.72);color:#F8FAFC;border:1px solid rgba(255,255,255,0.07);border-radius:14px;font-family:inherit}
.ew-screen input:focus,.ew-screen select:focus{border-color:#9585FF;outline-color:#9585FF}
.ew-screen .alert{background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:16px;color:#F8FAFC;overflow-wrap:anywhere}
.ew-screen .alert.error{color:#FF738A;border-color:rgba(255,115,138,0.4)}
.ew-screen .alert.info{color:#98A4BA}
.ew-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;width:100%;min-width:0}
.ew-filters{display:flex;flex-wrap:wrap;gap:8px;width:100%;max-width:100%}
.ew-filters .btn{flex:1 1 9rem;min-height:44px;white-space:normal;text-align:center}
.ew-end{display:flex;flex-wrap:wrap;gap:10px;width:100%}
.ew-end .btn{flex:1 1 100%;min-height:44px}
.ew-screen .money{padding:16px;display:grid;gap:12px;width:100%;overflow:hidden}
.ew-screen .money-kicker,.ew-screen .money-caption,.ew-screen .money-income,.ew-screen .money-name{color:#98A4BA}
.ew-screen .money-figure{color:#FF738A;font-size:clamp(1.55rem,7vw,2.1rem);overflow-wrap:anywhere;max-width:100%}
.ew-screen .money-pos{color:#4EE0B5}
.ew-screen .money-list{border-top-color:rgba(255,255,255,0.07);width:100%;min-width:0}
.ew-screen .money-list li{grid-template-columns:minmax(0,1fr) minmax(0,48%);border-bottom-color:rgba(255,255,255,0.07);max-width:100%}
.ew-screen .money-amt{color:#FF738A;text-align:right;font-variant-numeric:tabular-nums;white-space:normal;overflow-wrap:anywhere}
.ew-screen .money-list .money-income,.ew-screen .money-list .fx{overflow-wrap:anywhere}
.ew-report{width:100%;max-width:100%;min-width:0;overflow:hidden;display:grid;gap:16px}
.ew-report .card{min-width:0;overflow:hidden}
.ew-report .chart{width:100%;max-width:100%;height:220px;min-height:220px;min-width:0;overflow:hidden}
.ew-report .recharts-responsive-container,.ew-report .recharts-wrapper{width:100%!important;max-width:100%!important}
.ew-report .recharts-cartesian-axis-tick text{fill:#98A4BA}
.ew-report .recharts-cartesian-grid line{stroke:rgba(255,255,255,0.07)}
.ew-report .chart-key{color:#98A4BA;flex-wrap:wrap;max-width:100%}
@media (min-width:861px){
  .ew-report .chart{height:280px;min-height:280px}
}
`;

function Reports({ space }: { space: Space }) {
  const { user } = useAuth();
  const view = user?.report_view ?? "both";
  const [from, setFrom] = useState(monthStartDisplay());
  const [to, setTo] = useState(todayDisplay());
  const [scope, setScope] = useState<"current" | "all">("current");
  const [report, setReport] = useState<ReportModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [applied, setApplied] = useState({ from: monthStartDisplay(), to: todayDisplay(), scope: "current" as "current" | "all" });

  async function load(nextFrom: string, nextTo: string, nextScope: "current" | "all") {
    setLoading(true);
    setError(null);
    try {
      const data = await resources.report({
        spaceId: nextScope === "current" ? space.id : undefined,
        from: parseDisplayDate(nextFrom),
        to: parseDisplayDate(nextTo),
        view,
      });
      setReport(data);
      setApplied({ from: nextFrom, to: nextTo, scope: nextScope });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(monthStartDisplay(), todayDisplay(), "current");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.id, view]);

  return (
    <div className="ew-screen">
      <style>{screenCss}</style>
      <PageHeader title="Rapoarte" lede="Transferurile nu intră în venituri, cheltuieli sau categorii." />
      <p className="muted">
        {applied.from || "—"} – {applied.to || "—"} · {applied.scope === "all" ? "Toate spațiile vizibile" : "Spațiul curent"}
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
          void load(from, to, scope);
        }}
      >
        <div className="ew-filters">
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setFrom(monthStartDisplay());
              setTo(todayDisplay());
            }}
          >
            Luna aceasta
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setFrom(formatDisplayDate(yearStartIso()));
              setTo(todayDisplay());
            }}
          >
            Anul acesta
          </button>
        </div>
        <div className="ew-fields">
          <Field label="De la">
            <input value={from} placeholder="ZZ.LL.AAAA" onChange={(event) => setFrom(event.target.value)} required />
          </Field>
          <Field label="Până la">
            <input value={to} placeholder="ZZ.LL.AAAA" onChange={(event) => setTo(event.target.value)} required />
          </Field>
          <Field label="Spații">
            <select value={scope} onChange={(event) => setScope(event.target.value as "current" | "all")}>
              <option value="current">Spațiul curent</option>
              <option value="all">Toate spațiile vizibile</option>
            </select>
          </Field>
        </div>
        <div className="ew-end">
          <button className="btn primary" type="submit">
            Actualizează
          </button>
        </div>
      </form>
      ) : null}
      <p className="muted">Afișarea urmează comutatorul din profil: individual, consolidat în RON sau ambele.</p>
      {error ? <Alert>{error}</Alert> : null}
      {loading || !report ? <p className="muted">Se încarcă raportul…</p> : (
        <>
          <MoneySummary report={report} view={view} />
          <div className="ew-report">
            <ReportChart report={report} view={view} />
          </div>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <SpaceBody>{(space) => <Reports space={space} />}</SpaceBody>
    </Guard>
  );
}
