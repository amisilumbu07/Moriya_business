"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFeedback } from "@/components/Feedback";
import { api, ApiError, formatDate, type ExpiryWarning, type RestockWarning, type Warnings } from "@/lib/api";
import { expiryText, restockText } from "@/lib/warnings";

const SEV = {
  red: { icon: "🔴", cls: "sev-red", badge: "badge-danger", label: "Urgent" },
  orange: { icon: "🟠", cls: "sev-orange", badge: "badge-orange", label: "Soon" },
  yellow: { icon: "🟡", cls: "sev-yellow", badge: "badge-yellow", label: "Watch" },
} as const;

export default function WarningsPage() {
  const { toast } = useFeedback();
  const [data, setData] = useState<Warnings | null>(null);
  const [showHandled, setShowHandled] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api<Warnings>("/api/warnings")
      .then(setData)
      .catch((e) => toast("error", e instanceof ApiError ? e.message : "Could not load warnings"));
  }, [reloadKey, toast]);

  async function toggle(kind: "EXPIRY" | "RESTOCK", ref: number, handled: boolean) {
    try {
      if (handled) await api(`/api/warnings/handle?kind=${kind}&ref_id=${ref}`, { method: "DELETE" });
      else await api("/api/warnings/handle", { method: "POST", body: JSON.stringify({ kind, ref_id: ref }) });
      toast(handled ? "info" : "success", handled ? "Moved back to active" : "Marked as handled");
      setReloadKey((k) => k + 1);
      window.dispatchEvent(new Event("warnings-changed"));
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Could not update");
    }
  }

  const expiry: ExpiryWarning[] = data ? data.expiry.filter((w) => showHandled || !w.handled) : [];
  const restock: RestockWarning[] = data ? data.restock.filter((w) => showHandled || !w.handled) : [];
  const total = data ? data.counts.expiry + data.counts.restock : 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">⚠️ Warnings</h1>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={showHandled} onChange={(e) => setShowHandled(e.target.checked)} />
          Show handled
        </label>
      </div>

      {!data ? <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20" />)}</div> : (
        <>
          {total === 0 && (
            <div className="card pop-in text-center" style={{ borderColor: "var(--success)" }}>
              <p className="text-4xl">🎉</p><p className="mt-1 text-lg font-bold">All clear</p>
              <p className="text-sm text-muted">Nothing needs attention right now.</p>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">⏳ Expiry
              <span className="badge badge-muted">{data.counts.expiry} to handle</span>
              <span className="text-xs font-normal text-muted">🔴 expired or ≤ 3 days · 🟠 ≤ 7 days · 🟡 within the warning window</span></h2>
            {expiry.length === 0 ? <p className="text-sm text-muted">No batches close to expiry.</p> : (
              <ul className="stagger space-y-3">
                {expiry.map((w) => {
                  const s = SEV[w.severity];
                  return (
                    <li key={w.batch_id} className={`card sev ${s.cls} flex flex-wrap items-center justify-between gap-3 ${w.handled ? "opacity-60" : ""}`}>
                      <div>
                        <p className="font-bold">{s.icon} {w.product_name} <span className="font-normal text-muted">· {w.quantity_remaining} {w.unit}</span></p>
                        <p className="mt-1 text-sm"><span className={`badge ${s.badge}`}>{expiryText(w.days_left)}</span> <span className="text-muted">({formatDate(w.expiry_date)})</span>
                          {w.handled && <span className="badge badge-success ml-2">handled</span>}</p>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/inventory/${w.product_id}`} className="btn btn-ghost btn-sm">Batches</Link>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggle("EXPIRY", w.batch_id, w.handled)}>{w.handled ? "Undo" : "✓ Mark handled"}</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">📦 Restock <span className="badge badge-muted">{data.counts.restock} to handle</span></h2>
            {restock.length === 0 ? <p className="text-sm text-muted">Every product has enough stock.</p> : (
              <ul className="stagger space-y-3">
                {restock.map((w) => {
                  const urgent = w.reasons.includes("OUT_OF_STOCK") || (w.days_left !== null && w.days_left <= 3);
                  return (
                    <li key={w.product_id} className={`card sev ${urgent ? "sev-red" : "sev-orange"} flex flex-wrap items-center justify-between gap-3 ${w.handled ? "opacity-60" : ""}`}>
                      <div>
                        <p className="font-bold">{w.product_name} <span className="font-normal text-muted">· {w.quantity_on_hand} {w.unit} left</span></p>
                        <p className="mt-1 text-sm text-muted">{restockText(w)}{w.handled && <span className="badge badge-success ml-2">handled</span>}</p>
                      </div>
                      <div className="flex gap-2">
                        <Link href="/inventory/receive" className="btn btn-primary btn-sm">Receive stock</Link>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggle("RESTOCK", w.product_id, w.handled)}>{w.handled ? "Undo" : "✓ Mark handled"}</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="hint">“About N days left” compares the stock on hand with the product&apos;s average daily sales over the last 28 days. A handled restock warning comes back if new stock arrives and runs low again.</p>
          </div>
        </>
      )}
    </section>
  );
}
