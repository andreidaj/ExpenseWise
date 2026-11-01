"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDisplayDate, formatMoney } from "@/lib/format";
import type { ReportModel, ReportView } from "@/lib/types";

const tick = { fill: "var(--muted)", fontSize: 12, fontFamily: "inherit" };
const grid = "var(--line)";
const tip = {
  background: "var(--elevated)",
  border: "1px solid var(--line)",
  borderRadius: 14,
  boxShadow: "var(--shadow)",
  color: "var(--text)",
  fontSize: 14,
};

function moneyTip(value: unknown, currency: string) {
  const numeric = typeof value === "number" ? value : Number(value);
  return formatMoney(Number.isFinite(numeric) ? numeric : 0, currency);
}

export function ReportChart({ report, view }: { report: ReportModel; view: ReportView }) {
  const useRon = view !== "separate";
  const categories = report.categories
    .filter((row) => row.kind !== "income")
    .map((row) => ({
      name: useRon || row.currency === "RON" ? row.name : `${row.name} (${row.currency})`,
      value: Number(useRon ? row.amountRon || row.amount : row.amount) || 0,
      currency: useRon ? "RON" : row.currency,
    }))
    .filter((row) => row.value > 0);

  const series = report.series.map((point) => ({
    ...point,
    label: formatDisplayDate(point.date),
  }));
  const currency = useRon ? "RON" : categories[0]?.currency || "RON";

  if (!categories.length && !series.length) {
    return <p className="empty">Nu există date pentru grafic în perioada aleasă.</p>;
  }

  return (
    <div className="stack">
      {categories.length ? (
        <section className="card stack">
          <h2>Cheltuieli pe categorii</h2>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categories} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={70} tick={tick} tickLine={false} axisLine={{ stroke: grid }} />
                <YAxis tick={tick} tickLine={false} axisLine={false} width={48} />
                <Tooltip
                  formatter={(value) => moneyTip(value, currency)}
                  contentStyle={tip}
                  cursor={{ fill: "var(--hover)" }}
                />
                <Bar dataKey="value" fill="var(--expense)" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}
      {series.length ? (
        <section className="card stack">
          <h2>Cheltuieli în timp</h2>
          <p className="chart-key">
            <span className="key">
              <span className="swatch brick" />
              Cheltuieli
            </span>
            <span className="key">
              <span className="swatch forest" />
              Venituri
            </span>
          </p>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: grid }} />
                <YAxis tick={tick} tickLine={false} axisLine={false} width={48} />
                <Tooltip
                  formatter={(value) => moneyTip(value, currency)}
                  contentStyle={tip}
                  cursor={{ stroke: grid }}
                />
                <Line type="monotone" dataKey="expense" name="Cheltuieli" stroke="var(--expense)" strokeWidth={2.25} dot={false} />
                <Line type="monotone" dataKey="income" name="Venituri" stroke="var(--income)" strokeWidth={2.25} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}
    </div>
  );
}
