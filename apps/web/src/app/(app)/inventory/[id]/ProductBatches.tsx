"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, formatMoney, type Batch, type Product } from "@/lib/api";
import { btnCls, btnGhostCls, inputCls, tdCls, thCls } from "@/components/ui";

export default function ProductBatches({ id }: { id: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [adjusting, setAdjusting] = useState<number | null>(null);
  const [change, setChange] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    Promise.all([
      api<Product[]>("/api/products?include_inactive=true"),
      api<Batch[]>(`/api/products/${id}/batches`),
    ])
      .then(([products, b]) => {
        setProduct(products.find((p) => String(p.id) === id) ?? null);
        setBatches(b);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load"));
  }, [id, reloadKey]);

  async function adjust(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(change);
    if (!Number.isInteger(n) || n === 0) return setError("Enter a whole number other than 0 (negative removes stock)");
    if (!reason.trim()) return setError("A reason is required");
    try {
      await api("/api/stock/adjust", {
        method: "POST",
        body: JSON.stringify({ batch_id: adjusting, quantity_change: n, reason }),
      });
      setAdjusting(null);
      setChange("");
      setReason("");
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    }
  }

  return (
    <section className="space-y-4">
      <Link href="/inventory" className="text-sm underline">
        ← Inventory
      </Link>
      <h1 className="text-xl font-semibold">{product ? product.name : "Product"} — batches</h1>
      {product && (
        <p className="text-sm opacity-70">
          On hand: {product.quantity_on_hand} {product.unit}
          {product.low_stock && <span className="ml-2 rounded bg-red-600 px-2 py-0.5 text-xs text-white">Low stock</span>}
        </p>
      )}

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-black/10 dark:border-white/15">
            <tr>
              <th className={thCls}>Received</th>
              <th className={thCls}>Expiry</th>
              <th className={thCls}>Received qty</th>
              <th className={thCls}>Remaining</th>
              <th className={thCls}>Cost</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-black/5 dark:border-white/10">
                <td className={tdCls}>{b.received_at}</td>
                <td className={tdCls}>{b.expiry_date ?? "—"}</td>
                <td className={tdCls}>{b.quantity_received}</td>
                <td className={tdCls}>{b.quantity_remaining}</td>
                <td className={tdCls}>{formatMoney(b.cost_price)}</td>
                <td className={`${tdCls} text-right`}>
                  <button className={btnGhostCls} onClick={() => { setAdjusting(b.id); setError(null); }}>
                    Adjust
                  </button>
                </td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr>
                <td className={tdCls} colSpan={6}>No stock received yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adjusting !== null && (
        <form onSubmit={adjust} className="max-w-md space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
          <h2 className="text-sm font-semibold">Adjust batch #{adjusting}</h2>
          <label className="block text-sm">
            Change (e.g. -2 for spoiled, 3 to add)
            <input className={inputCls} inputMode="numeric" value={change} onChange={(e) => setChange(e.target.value)} required />
          </label>
          <label className="block text-sm">
            Reason
            <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={200} placeholder="Spoiled, damaged, miscount…" />
          </label>
          <div className="flex gap-2">
            <button className={btnCls}>Save adjustment</button>
            <button type="button" className={btnGhostCls} onClick={() => setAdjusting(null)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
