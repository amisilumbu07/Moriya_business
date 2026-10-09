"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { api, formatDate, todayIso, type Day, type Product, type Warnings, type Week, ApiError } from "@/lib/api";

type State = { today: string; todayRecord: Day | null; week: Week; lowStock: Product[]; warnings: Warnings };

export default function DashboardPage() {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const today = todayIso();
    Promise.all([
      api<Day>(`/api/sales/${today}`).catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
      api<Week>(`/api/weekly?date=${today}`),
      api<Product[]>("/api/products"),
      api<Warnings>("/api/warnings"),
    ])
      .then(([todayRecord, week, products, warnings]) =>
        setData({ today, todayRecord, week, lowStock: products.filter((p) => p.low_stock), warnings }),
      )
      .catch(() => setError(true));
  }, []);

  if (error) return <p role="alert" className="field-error">Could not load the dashboard. Refresh to try again.</p>;
  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-32" />)}
      </div>
    );
  }
  const { today, todayRecord, week, lowStock, warnings } = data;
  const expiryUrgent = warnings.expiry.filter((w) => !w.handled && w.severity === "red").length;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Welcome back 👋</h1>
        <p className="text-sm text-muted">{formatDate(today)}</p>
      </div>

      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={`/sales/${today}`} className="card card-hover block">
          <p className="label">Today</p>
          {todayRecord ? (
            <>
              <p className="mt-2 text-2xl font-extrabold"><AnimatedNumber value={todayRecord.total_amount} /></p>
              <span className="badge badge-success mt-2">✓ Recorded · tap to edit</span>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-bold">Not recorded yet</p>
              <span className="badge badge-warning badge-pulse mt-2">Tap to record today&apos;s sales</span>
            </>
          )}
        </Link>

        <Link href="/weekly" className="card card-hover block">
          <p className="label">This week</p>
          <p className="mt-2 text-2xl font-extrabold"><AnimatedNumber value={week.total} /></p>
          <p className="mt-2 text-sm text-muted">
            Tithe <b className="text-foreground"><AnimatedNumber value={week.tithe} /></b> · Offering{" "}
            <b className="text-foreground"><AnimatedNumber value={week.offering} /></b>
          </p>
        </Link>

        <Link href="/inventory" className="card card-hover block">
          <p className="label">Stock alerts</p>
          <p className="mt-2 text-2xl font-extrabold"><AnimatedNumber value={lowStock.length} money={false} /></p>
          {lowStock.length > 0 ? (
            <p className="mt-2 text-sm text-danger">
              {lowStock.slice(0, 3).map((p) => p.name).join(", ")}{lowStock.length > 3 ? "…" : ""} running low
            </p>
          ) : (
            <span className="badge badge-success mt-2">✓ Everything stocked</span>
          )}
        </Link>

        <Link href="/warnings" className="card card-hover block" style={warnings.counts.expiry + warnings.counts.restock > 0 ? { borderColor: expiryUrgent ? "var(--danger)" : "var(--warning)" } : undefined}>
          <p className="label">Warnings</p>
          <p className="mt-2 text-2xl font-extrabold"><AnimatedNumber value={warnings.counts.expiry + warnings.counts.restock} money={false} /></p>
          {warnings.counts.expiry + warnings.counts.restock === 0 ? <span className="badge badge-success mt-2">✓ All clear</span> : (
            <p className="mt-2 text-sm">
              {warnings.counts.expiry > 0 && <span className={expiryUrgent ? "text-danger" : "text-warning"}>⏳ {warnings.counts.expiry} expiry{expiryUrgent ? ` (${expiryUrgent} urgent)` : ""}</span>}
              {warnings.counts.expiry > 0 && warnings.counts.restock > 0 && " · "}
              {warnings.counts.restock > 0 && <span>📦 {warnings.counts.restock} restock</span>}
            </p>
          )}
        </Link>
      </div>

      <div className="stagger grid gap-3 sm:grid-cols-3">
        <Link href={`/sales/${today}`} className="btn btn-primary">🧾 Record today&apos;s sales</Link>
        <Link href="/inventory/receive" className="btn btn-ghost">📦 Receive stock</Link>
        <Link href="/products" className="btn btn-ghost">🏷️ Manage products</Link>
      </div>
    </section>
  );
}
