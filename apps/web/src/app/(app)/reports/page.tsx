"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { useFeedback } from "@/components/Feedback";
import { api, ApiError, formatDate, formatMoney, type Report, type ReportListItem } from "@/lib/api";
import { expiryText, restockText } from "@/lib/warnings";

export default function ReportsPage() {
  const { toast } = useFeedback();
  const [list, setList] = useState<ReportListItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Report | null>(null);

  useEffect(() => {
    api<ReportListItem[]>("/api/reports")
      .then((l) => { setList(l); setSelected((s) => s ?? l[0]?.week_start ?? null); })
      .catch((e) => toast("error", e instanceof ApiError ? e.message : "Could not load reports"));
  }, [toast]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    api<Report>(`/api/reports/${selected}`)
      .then((r) => !cancelled && setDetail(r))
      .catch((e) => toast("error", e instanceof ApiError ? e.message : "Could not load that report"));
    return () => { cancelled = true; };
  }, [selected, toast]);

  const shown = detail?.week_start === selected ? detail : null;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">🗂️ Weekly reports</h1>
        <p className="text-sm text-muted">A report is created automatically every Monday morning for the week that just ended. Past weeks stay here exactly as they were.</p>
      </div>

      {!list ? <div className="skeleton h-40" /> : list.length === 0 ? <p className="card text-center text-muted">📭 No reports yet.</p> : (
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          <ul className="card stagger max-h-[32rem] space-y-1 overflow-y-auto p-2">
            {list.map((r) => (
              <li key={r.week_start}>
                <button onClick={() => setSelected(r.week_start)} aria-current={selected === r.week_start ? "true" : undefined}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${selected === r.week_start ? "bg-gradient-to-br from-primary to-primary-2 text-on-primary" : "hover:bg-surface-2"}`}>
                  {formatDate(r.week_start, { day: "numeric", month: "short" })} – {formatDate(r.week_end, { day: "numeric", month: "short", year: "numeric" })}
                </button>
              </li>
            ))}
          </ul>

          {!shown ? <div className="skeleton h-80" /> : (
            <div key={shown.week_start} className="page space-y-4">
              <p className="text-sm text-muted">Week of {formatDate(shown.week_start)} · generated {new Date(shown.generated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
              <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[["Total", shown.week.total], [`Tithe ${shown.week.tithe_percent}%`, shown.week.tithe], [`Offering ${shown.week.offering_percent}%`, shown.week.offering], ["Remaining", shown.week.remaining]].map(([label, v]) => (
                  <div key={label as string} className="card"><p className="label">{label}</p><p className="mt-2 text-xl font-extrabold"><AnimatedNumber value={v as number} /></p></div>
                ))}
              </div>
              {shown.week.days.some((d) => d.mode === null) && <p className="card text-sm" style={{ borderColor: "var(--warning)" }}>⚠ Some days had no record, so these figures may be incomplete. {shown.week.days.filter((d) => d.mode === null).map((d) => formatDate(d.date, { weekday: "short" })).join(", ")}.</p>}

              <div className="card space-y-2"><h2 className="font-bold">🏆 Best sellers</h2>
                {shown.top_products.length === 0 ? <p className="text-sm text-muted">No itemised sales that week.</p> : (
                  <ol className="divide-y divide-line text-sm">{shown.top_products.map((p, i) => (
                    <li key={p.name} className="flex justify-between gap-3 py-2"><span><b>{i + 1}.</b> {p.name}</span><span className="text-muted">{p.units} {p.unit} · {formatMoney(p.revenue)}</span></li>))}</ol>)}
                {shown.total_only_days > 0 && <p className="hint">{shown.total_only_days} total-only day(s) are not in this list.</p>}
              </div>

              <div className="card space-y-2"><h2 className="font-bold">⚠️ Warnings at the time</h2>
                {shown.warnings.expiry.length + shown.warnings.restock.length === 0 ? <p className="text-sm text-muted">All clear.</p> : (
                  <ul className="space-y-1.5 text-sm">
                    {shown.warnings.expiry.map((w) => <li key={`e${w.batch_id}`}>⏳ <b>{w.product_name}</b> — {expiryText(w.days_left)} ({w.quantity_remaining} {w.unit})</li>)}
                    {shown.warnings.restock.map((w) => <li key={`r${w.product_id}`}>📦 <b>{w.product_name}</b> — {restockText(w)}</li>)}
                  </ul>)}
                <p className="hint">This is a snapshot from when the report was created. <Link href="/warnings" className="font-semibold text-primary">See today&apos;s warnings →</Link></p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
