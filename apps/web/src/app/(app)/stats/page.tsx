"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { useFeedback } from "@/components/Feedback";
import { addDays, api, ApiError, formatDate, formatMoney, formatPercent, todayIso, toIso, type Stats, type Week } from "@/lib/api";

type Preset = "week" | "lastweek" | "month" | "custom";
const COLORS = ["var(--primary)", "var(--primary-2)", "var(--success)", "var(--warning)", "var(--danger)", "var(--muted)"];
const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--text)" };
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(n);
/** Axis labels for money values, which arrive in ngwee. */
const compactMoney = (ngwee: number) => compact(ngwee / 100);

export default function StatsPage() {
  const { toast } = useFeedback();
  const [preset, setPreset] = useState<Preset>("week");
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [custom, setCustom] = useState({ start: "", end: "" });
  const [metric, setMetric] = useState<"units" | "revenue">("units");
  const [result, setResult] = useState<{ key: string; stats: Stats } | null>(null);

  async function choose(p: Preset) {
    setPreset(p);
    if (p === "custom") return;
    const today = todayIso();
    try {
      if (p === "month") {
        const d = new Date();
        setRange({ start: toIso(new Date(d.getFullYear(), d.getMonth(), 1)), end: today });
      } else {
        const w = await api<Week>(`/api/weekly?date=${p === "week" ? today : addDays(today, -7)}`);
        setRange({ start: w.week_start, end: p === "week" && w.week_end > today ? today : w.week_end });
      }
    } catch {
      toast("error", "Could not work out that date range");
    }
  }

  useEffect(() => {
    setTimeout(() => void choose("week"), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key = range ? `${range.start}|${range.end}` : "";
  useEffect(() => {
    if (!range) return;
    let cancelled = false;
    api<Stats>(`/api/stats?start=${range.start}&end=${range.end}`)
      .then((stats) => !cancelled && setResult({ key: `${range.start}|${range.end}`, stats }))
      .catch((e) => toast("error", e instanceof ApiError ? e.message : "Could not load statistics"));
    return () => { cancelled = true; };
  }, [range, toast]);

  const stats = result?.key === key ? result.stats : null;
  const isOwner = stats?.profit_total != null;
  const top = useMemo(
    () => (stats ? [...stats.products].sort((a, b) => b[metric] - a[metric]).slice(0, 10) : []),
    [stats, metric],
  );
  const byProfit = useMemo(() => (stats ? [...stats.products].sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0)) : []), [stats]);
  const maxProfit = Math.max(1, ...byProfit.map((p) => Math.abs(p.profit ?? 0)));
  const hasProducts = !!stats && stats.products.length > 0;
  const margin = stats && stats.revenue_itemised > 0 && stats.profit_total != null ? (stats.profit_total / stats.revenue_itemised) * 100 : null;

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-extrabold">📈 Sales statistics</h1>

      <div className="card flex flex-wrap items-end gap-4">
        <div className="seg" role="group" aria-label="Date range">
          {([["week", "This week"], ["lastweek", "Last week"], ["month", "This month"], ["custom", "Custom"]] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={preset === id} onClick={() => choose(id)}>{label}</button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="pop-in flex flex-wrap items-end gap-3">
            <label className="label">From<input type="date" className="input" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} /></label>
            <label className="label">To<input type="date" className="input" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} /></label>
            <button className="btn btn-primary" disabled={!custom.start || !custom.end || custom.end < custom.start}
              onClick={() => setRange({ ...custom })}>Show</button>
            {custom.start && custom.end && custom.end < custom.start && <p className="field-error">“To” is before “From”.</p>}
          </div>
        )}
        {range && <p className="text-sm text-muted">{formatDate(range.start, { day: "numeric", month: "short" })} – {formatDate(range.end)}</p>}
      </div>

      {!stats ? (
        <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-28" />)}</div><div className="skeleton h-80" /></div>
      ) : (
        <>
          <div className="stagger grid gap-4 sm:grid-cols-3">
            <div className="card"><p className="label">Total sales</p><p className="mt-2 text-2xl font-extrabold"><AnimatedNumber value={stats.total_sales} /></p>
              <p className="hint">{stats.detailed_days + stats.total_only_days} day(s) recorded</p></div>
            <div className="card"><p className="label">Itemised sales</p><p className="mt-2 text-2xl font-extrabold"><AnimatedNumber value={stats.revenue_itemised} /></p>
              <p className="hint">{stats.products.reduce((s, p) => s + p.units, 0)} units · {stats.products.length} product(s)</p></div>
            {isOwner ? (
              <div className="card" style={{ borderColor: "var(--success)" }}><p className="label">💰 Profit (owner only)</p>
                <p className="mt-2 text-2xl font-extrabold text-success"><AnimatedNumber value={stats.profit_total ?? 0} /></p>
                <p className="hint">{margin !== null ? `${formatPercent(margin)} margin on itemised sales` : "No itemised sales yet"}</p></div>
            ) : (
              <div className="card"><p className="label">Best seller</p><p className="mt-2 text-xl font-extrabold">{stats.products[0]?.name ?? "—"}</p>
                <p className="hint">{stats.products[0] ? `${stats.products[0].units} units` : "No itemised sales yet"}</p></div>
            )}
          </div>

          {stats.total_only_days > 0 && (
            <p className="card text-sm" style={{ borderColor: "var(--warning)" }}>
              ℹ️ {stats.total_only_days} day(s) were recorded as <b>total only</b> ({formatMoney(stats.total_only_total)}). They count in the sales trend but not in the product charts, because they have no item detail.
            </p>
          )}

          <div className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-bold">🏆 Top 10 products</h2>
              <div className="seg" role="group" aria-label="Measure">
                <button type="button" aria-pressed={metric === "units"} onClick={() => setMetric("units")}>Units</button>
                <button type="button" aria-pressed={metric === "revenue"} onClick={() => setMetric("revenue")}>Revenue</button>
              </div>
            </div>
            {hasProducts ? (
              <div role="img" aria-label={`Bar chart of the top products by ${metric}`} style={{ height: Math.max(220, top.length * 44) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid horizontal={false} stroke="var(--line)" />
                    <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 12 }} tickFormatter={metric === "revenue" ? compactMoney : compact} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fill: "var(--text)", fontSize: 13 }} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }}
                      formatter={(v) => [metric === "revenue" ? formatMoney(Number(v)) : `${v} units`, metric === "revenue" ? "Revenue" : "Sold"]} />
                    <Bar dataKey={metric} fill="var(--primary)" radius={[0, 8, 8, 0]} animationDuration={700} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="py-10 text-center text-muted">📭 No itemised sales in this period.</p>}
          </div>

          <div className="card space-y-3">
            <h2 className="font-bold">📅 Sales over time <span className="badge badge-muted ml-1">{stats.trend_group === "day" ? "per day" : "per week"}</span></h2>
            {stats.total_sales > 0 ? (
              <div role="img" aria-label="Line chart of sales over time" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.trend} margin={{ left: 0, right: 16, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="date" tick={{ fill: "var(--muted)", fontSize: 12 }} tickFormatter={(d) => formatDate(d, { day: "numeric", month: "short" })} minTickGap={24} />
                    <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} tickFormatter={compactMoney} width={48} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => formatDate(String(d))} formatter={(v) => [formatMoney(Number(v)), "Sales"]} />
                    <Line type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={3} dot={stats.trend.length <= 14} activeDot={{ r: 6 }} animationDuration={900} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="py-10 text-center text-muted">📭 No sales recorded in this period.</p>}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card space-y-3">
              <h2 className="font-bold">🧩 Sales by category</h2>
              {stats.categories.some((c) => c.revenue > 0) ? (
                <div className="flex flex-wrap items-center gap-4">
                  <div role="img" aria-label="Donut chart of revenue by category" style={{ height: 200, width: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats.categories} dataKey="revenue" nameKey="category" innerRadius={55} outerRadius={90} paddingAngle={2} animationDuration={800} stroke="var(--surface)">
                          {stats.categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatMoney(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="min-w-40 flex-1 space-y-1.5 text-sm">
                    {stats.categories.map((c, i) => (
                      <li key={c.category} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{c.category}</span>
                        <b className="tabular-nums">{formatMoney(c.revenue)}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : <p className="py-10 text-center text-muted">📭 No itemised sales in this period.</p>}
            </div>

            <div className="card space-y-3">
              <h2 className="font-bold">🐢 Slow movers</h2>
              <p className="hint">In stock but {stats.slow_mover_max_units === 0 ? "not sold" : `sold ${stats.slow_mover_max_units} or fewer`} in this period.</p>
              {stats.slow_movers.length === 0 ? <p className="py-6 text-center text-muted">🎉 Nothing is stuck on the shelf.</p> : (
                <ul className="stagger divide-y divide-line text-sm">
                  {stats.slow_movers.map((s) => (
                    <li key={s.product_id} className="flex items-center justify-between gap-3 py-2">
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-muted">{s.units} sold · {s.quantity_on_hand} {s.unit} in stock</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {isOwner && (
            <div className="card space-y-3" style={{ borderColor: "var(--success)" }}>
              <h2 className="font-bold">💰 Profit by product <span className="badge badge-success ml-1">owner only</span></h2>
              <p className="hint">Profit = sales − what the sold units cost you (the cost price of the exact batches they came from). Itemised days only.</p>
              {byProfit.length === 0 ? <p className="py-6 text-center text-muted">📭 No itemised sales in this period.</p> : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>Product</th><th className="text-right">Units</th><th className="text-right">Sales</th><th className="text-right">Cost</th><th className="text-right">Profit</th><th>Margin</th></tr></thead>
                    <tbody>
                      {byProfit.map((p) => {
                        const m = p.revenue > 0 ? ((p.profit ?? 0) / p.revenue) * 100 : 0;
                        const loss = (p.profit ?? 0) < 0;
                        return (
                          <tr key={p.product_id}>
                            <td className="font-semibold">{p.name}</td>
                            <td className="text-right tabular-nums">{p.units}</td>
                            <td className="text-right tabular-nums">{formatMoney(p.revenue)}</td>
                            <td className="text-right tabular-nums">{formatMoney(p.cost ?? 0)}</td>
                            <td className={`text-right font-bold tabular-nums ${loss ? "text-danger" : "text-success"}`}>{loss ? "−" : ""}{formatMoney(Math.abs(p.profit ?? 0))}</td>
                            <td className="min-w-32">
                              <div className="flex items-center gap-2"><div className="bar-track flex-1"><div className="bar-fill" style={{ width: `${(Math.abs(p.profit ?? 0) / maxProfit) * 100}%`, background: loss ? "var(--danger)" : undefined }} /></div>
                                <span className="w-14 text-right text-xs tabular-nums text-muted">{formatPercent(m)}</span></div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot><tr><td className="font-bold">Total</td><td className="text-right font-bold">{byProfit.reduce((s, p) => s + p.units, 0)}</td>
                      <td className="text-right font-bold tabular-nums">{formatMoney(stats.revenue_itemised)}</td><td className="text-right font-bold tabular-nums">{formatMoney(stats.cost_total ?? 0)}</td>
                      <td className="text-right font-bold tabular-nums text-success">{formatMoney(stats.profit_total ?? 0)}</td><td /></tr></tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
