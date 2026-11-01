"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { usePrefersReducedMotion } from "@/components/Providers";
import { formatMoney, fxCaption } from "@/lib/format";
import type { CurrencyTotal, ReportModel, ReportView } from "@/lib/types";

function notes(row: CurrencyTotal, view: ReportView) {
  const converted = row.currency !== "RON" && (row.expenseRon || row.incomeRon);
  const caption = fxCaption(row.fxRate, row.fxSource, row.fxDate);
  return (
    <>
      {view !== "separate" && converted ? (
        <span className="fx">
          ≈ {formatMoney(row.expenseRon || "0", "RON")}
          {caption ? ` (${caption})` : ""}
        </span>
      ) : null}
      {row.missingFx ? <span className="fx">Fără curs, în afara totalului RON.</span> : null}
    </>
  );
}

function Hero({ children }: { children: ReactNode }) {
  const reduce = usePrefersReducedMotion();
  return (
    <motion.header
      className="money-hero"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.35 }}
    >
      {children}
    </motion.header>
  );
}

export function MoneySummary({ report, view }: { report: ReportModel; view: ReportView }) {
  const showSeparate = view === "separate" || view === "both";
  const showConsolidated = view === "consolidated" || view === "both";
  const missing = report.consolidated?.missingFx ?? report.byCurrency.filter((row) => row.missingFx).length;
  const rows = report.byCurrency;
  const lead = showSeparate && !showConsolidated ? (rows.find((row) => row.currency === "RON") ?? rows[0]) : undefined;
  const detailRows = lead ? rows.filter((row) => row !== lead) : rows;
  const conversions =
    showConsolidated && view === "consolidated"
      ? rows.filter((row) => row.currency !== "RON" && (row.expenseRon || row.incomeRon || row.fxRate))
      : [];

  return (
    <section className="money" aria-label="Sume">
      {showConsolidated ? (
        <Hero>
          <p className="money-kicker">Total consolidat</p>
          <p className="money-figure">{formatMoney(report.consolidated?.expense ?? "0", "RON")}</p>
          <p className="money-caption">Cheltuieli în RON</p>
          <p className="money-income">
            Venituri <span className="money-pos">{formatMoney(report.consolidated?.income ?? "0", "RON")}</span>
          </p>
        </Hero>
      ) : lead ? (
        <Hero>
          <p className="money-kicker">Cheltuieli {lead.currency}</p>
          <p className="money-figure">{formatMoney(lead.expense, lead.currency)}</p>
          <p className="money-income">
            Venituri <span className="money-pos">{formatMoney(lead.income, lead.currency)}</span>
          </p>
          {notes(lead, view)}
        </Hero>
      ) : null}
      {showSeparate ? (
        detailRows.length ? (
          <ul className="money-list">
            {detailRows.map((row) => (
              <li key={row.currency}>
                <span className="money-name">Cheltuieli {row.currency}</span>
                <span className="money-amt">{formatMoney(row.expense, row.currency)}</span>
                <span className="money-income">
                  Venituri <span className="money-pos">{formatMoney(row.income, row.currency)}</span>
                </span>
                {notes(row, view)}
              </li>
            ))}
          </ul>
        ) : !lead ? (
          <p className="empty">Nu există totaluri pe monedă în această perioadă.</p>
        ) : null
      ) : null}
      {conversions.length ? (
        <ul className="money-list">
          {conversions.map((row) => {
            const caption = fxCaption(row.fxRate, row.fxSource, row.fxDate);
            return (
              <li key={row.currency}>
                <span className="fx">
                  {formatMoney(row.expense, row.currency)} → {formatMoney(row.expenseRon || "0", "RON")}
                  {caption ? ` (${caption})` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {missing > 0 ? (
        <p className="alert info">
          {missing === 1 ? "O sumă nu are curs" : `${missing} sume nu au curs`} și nu intră în totalul consolidat în RON.
        </p>
      ) : null}
    </section>
  );
}
