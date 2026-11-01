"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formatDisplayDate, parseDisplayDate, todayIso } from "@/lib/format";
import { shiftPeriod, type IsoPeriod } from "@/lib/period";

const barCss = `
.ew-period{display:grid;gap:10px;width:100%;max-width:100%;min-width:0}
.ew-period-line{display:flex;align-items:center;gap:4px;width:100%;min-width:0}
.ew-period-arrow,.ew-period-label{min-height:44px;font-family:inherit;background:transparent;color:#98A4BA;border:1px solid transparent;border-radius:12px}
.ew-period-arrow{flex:0 0 44px;width:44px;padding:0;font-size:1.4rem;line-height:1}
.ew-period-arrow:hover:not(:disabled),.ew-period-label:hover{color:#F8FAFC;border-color:rgba(255,255,255,0.07)}
.ew-period-arrow:disabled{opacity:.35}
.ew-period-label{flex:1 1 auto;min-width:0;padding:8px 10px;font-size:.95rem;overflow-wrap:anywhere}
.ew-period-label[aria-expanded="true"]{color:#F8FAFC;border-color:rgba(255,255,255,0.07)}
.ew-period-edit{display:grid;gap:10px;padding:12px;background:#192132;border:1px solid rgba(255,255,255,0.07);border-radius:16px}
.ew-period-dates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0}
.ew-period-edit label{display:grid;gap:6px;min-width:0;color:#98A4BA;font-size:.86rem}
.ew-period-edit input{width:100%;max-width:100%;min-width:0;min-height:44px;background:rgba(11,15,25,0.72);color:#F8FAFC;border:1px solid rgba(255,255,255,0.07);border-radius:14px;font-family:inherit;padding:0 12px}
.ew-period-edit input:focus{border-color:#9585FF;outline-color:#9585FF}
.ew-period-edit .btn{min-height:44px;font-family:inherit;background:#9585FF;border:1px solid #9585FF;color:#0B0F19;border-radius:14px}
.ew-period-error{margin:0;color:#FF738A;font-size:.86rem}
@media (max-width:520px){
  .ew-period-dates{grid-template-columns:minmax(0,1fr)}
}
`;

export function PeriodBar({
  startDay,
  period,
  onApply,
}: {
  startDay: number;
  period: IsoPeriod;
  onApply: (next: IsoPeriod) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fromText, setFromText] = useState(formatDisplayDate(period.from));
  const [toText, setToText] = useState(formatDisplayDate(period.to));
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();
  const previous = shiftPeriod(period, -1, startDay, today);
  const next = shiftPeriod(period, 1, startDay, today);
  const endLabel = period.to === today ? "azi" : formatDisplayDate(period.to);
  const label = `${formatDisplayDate(period.from)} – ${endLabel}`;

  useEffect(() => {
    setFromText(formatDisplayDate(period.from));
    setToText(formatDisplayDate(period.to));
    setError(null);
  }, [period.from, period.to]);

  function apply(event: FormEvent) {
    event.preventDefault();
    try {
      const from = parseDisplayDate(fromText);
      const to = parseDisplayDate(toText);
      if (from > to) throw new Error("Data de început este după data de sfârșit.");
      if (to > today) throw new Error("Perioada se oprește azi.");
      setError(null);
      setOpen(false);
      onApply({ from, to });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Data nu este validă.");
    }
  }

  function move(nextPeriod: IsoPeriod) {
    setOpen(false);
    onApply(nextPeriod);
  }

  return (
    <form className="ew-period" onSubmit={apply}>
      <style>{barCss}</style>
      <div className="ew-period-line">
        <button
          className="ew-period-arrow"
          type="button"
          aria-label="Perioada anterioară"
          disabled={!previous}
          onClick={() => previous && move(previous)}
        >
          ‹
        </button>
        <button
          className="ew-period-label"
          type="button"
          aria-expanded={open}
          aria-label={`Perioada ${label}. Apasă ca să schimbi datele.`}
          onClick={() => setOpen((value) => !value)}
        >
          {label}
        </button>
        <button
          className="ew-period-arrow"
          type="button"
          aria-label="Perioada următoare"
          disabled={!next}
          onClick={() => next && move(next)}
        >
          ›
        </button>
      </div>
      {open ? (
        <div className="ew-period-edit">
          <div className="ew-period-dates">
            <label>
              De la
              <input value={fromText} placeholder="ZZ.LL.AAAA" onChange={(event) => setFromText(event.target.value)} required />
            </label>
            <label>
              Până la
              <input value={toText} placeholder="ZZ.LL.AAAA" onChange={(event) => setToText(event.target.value)} required />
            </label>
          </div>
          <button className="btn" type="submit">
            Arată
          </button>
          {error ? <p className="ew-period-error">{error}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
