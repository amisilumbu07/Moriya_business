"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { useFeedback } from "@/components/Feedback";
import { addDays, api, ApiError, formatDate, formatMoney, todayIso, type DaySummary } from "@/lib/api";

export default function SalesHistoryPage() {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [today, setToday] = useState("");
  const [pick, setPick] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setTimeout(() => { const t = todayIso(); setToday(t); setPick((p) => p || t); }, 0);
  }, []);

  useEffect(() => {
    api<DaySummary[]>("/api/sales?limit=100")
      .then(setDays)
      .catch((e) => toast("error", e instanceof ApiError ? e.message : "Could not load sales"));
  }, [reloadKey, toast]);

  const recorded = new Set(days?.map((d) => d.date));
  const missing = today && days ? [1, 2, 3, 4, 5, 6].map((n) => addDays(today, -n)).filter((d) => !recorded.has(d)) : [];

  async function remove(d: DaySummary) {
    const ok = await confirm({
      title: `Delete ${formatDate(d.date)}?`,
      message: d.mode === "DETAILED" ? "The sold items will be put back into stock. This cannot be undone." : "The recorded total will be removed. This cannot be undone.",
      confirmLabel: "Delete day", danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/sales/${d.date}`, { method: "DELETE" });
      toast("success", `${formatDate(d.date)} deleted`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Could not delete");
    }
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-extrabold">🧾 Sales</h1>

      <div className="card flex flex-wrap items-end gap-3">
        <Link href="/sales/today" className="btn btn-primary">Record today</Link>
        <span className="text-sm text-muted">or pick another day:</span>
        <input type="date" className="input !mt-0 !w-auto" value={pick} max={today || undefined} onChange={(e) => setPick(e.target.value)} aria-label="Day to record" />
        <button className="btn btn-ghost" disabled={!pick} onClick={() => router.push(`/sales/${pick}`)}>Open</button>
      </div>

      {missing.length > 0 && (
        <div className="card pop-in" style={{ borderColor: "var(--warning)" }}>
          <p className="text-sm font-bold text-warning">⚠ Days without a record this past week</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {missing.map((d) => <Link key={d} href={`/sales/${d}`} className="badge badge-warning hover:brightness-95">{formatDate(d, { weekday: "short", day: "numeric", month: "short" })} → add</Link>)}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-2">
        <table className="table">
          <thead><tr><th>Day</th><th>Type</th><th>Items</th><th className="text-right">Total</th><th></th></tr></thead>
          <tbody className="stagger">
            {!days && [0, 1, 2].map((i) => <tr key={i}><td colSpan={5}><div className="skeleton h-6" /></td></tr>)}
            {days?.map((d) => (
              <tr key={d.date}>
                <td className="font-semibold"><Link href={`/sales/${d.date}`} className="hover:text-primary">{formatDate(d.date)}</Link></td>
                <td><span className={`badge ${d.mode === "DETAILED" ? "badge-success" : "badge-muted"}`}>{d.mode === "DETAILED" ? "Itemised" : "Total only"}</span></td>
                <td>{d.mode === "DETAILED" ? d.item_count : "—"}</td>
                <td className="text-right font-bold tabular-nums">{formatMoney(d.total_amount)}</td>
                <td className="space-x-2 whitespace-nowrap text-right">
                  <Link href={`/sales/${d.date}`} className="btn btn-ghost btn-sm">Open</Link>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(d)} aria-label={`Delete ${formatDate(d.date)}`}>🗑</button>
                </td>
              </tr>
            ))}
            {days && days.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-muted">📭 No sales recorded yet. Tap “Record today” to start.</td></tr>}
          </tbody>
        </table>
      </div>
      {days && days.length > 0 && (
        <p className="text-sm text-muted">Showing the latest {days.length} days · total shown <b className="text-foreground"><AnimatedNumber value={days.reduce((s, d) => s + d.total_amount, 0)} /></b></p>
      )}
    </section>
  );
}
