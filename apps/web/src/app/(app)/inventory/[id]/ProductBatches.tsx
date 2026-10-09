"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, formatDate, formatMoney, type Batch, type Product } from "@/lib/api";
import { useFeedback } from "@/components/Feedback";

export default function ProductBatches({ id }: { id: string }) {
  const { toast, confirm } = useFeedback();
  const [product, setProduct] = useState<Product | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [adjusting, setAdjusting] = useState<Batch | null>(null);
  const [change, setChange] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    Promise.all([api<Product[]>("/api/products?include_inactive=true"), api<Batch[]>(`/api/products/${id}/batches`)])
      .then(([products, b]) => {
        setProduct(products.find((p) => String(p.id) === id) ?? null);
        setBatches(b);
      })
      .catch((e) => toast("error", e instanceof ApiError ? e.message : "Could not load"));
  }, [id, reloadKey, toast]);

  const n = Number(change);
  const valid = /^-?\d+$/.test(change) && n !== 0;
  const after = adjusting && valid ? adjusting.quantity_remaining + n : null;

  async function adjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjusting) return;
    if (!valid) return setError("Enter a whole number other than 0 (negative removes stock)");
    if (after !== null && after < 0) return setError(`Only ${adjusting.quantity_remaining} left in this batch`);
    if (!reason.trim()) return setError("A reason is required, so it can be traced later");
    if (n < 0 && !(await confirm({
      title: "Remove stock?",
      message: `Remove ${-n} from this batch (${adjusting.quantity_remaining} → ${after}). Reason: “${reason.trim()}”.`,
      confirmLabel: "Remove stock", danger: true,
    }))) return;
    try {
      await api("/api/stock/adjust", { method: "POST", body: JSON.stringify({ batch_id: adjusting.id, quantity_change: n, reason }) });
      toast("success", "Stock adjusted");
      setAdjusting(null); setChange(""); setReason(""); setError(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    }
  }

  return (
    <section className="space-y-5">
      <Link href="/inventory" className="text-sm font-semibold text-primary">← Inventory</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold">{product ? product.name : "Product"}</h1>
        {product && <span className="badge badge-muted">{product.quantity_on_hand} {product.unit} on hand</span>}
        {product?.low_stock && <span className="badge badge-danger badge-pulse">Low stock</span>}
      </div>

      <div className="card overflow-x-auto p-2">
        <table className="table">
          <thead><tr><th>Received</th><th>Expiry</th><th>Received qty</th><th>Remaining</th><th>Cost</th><th></th></tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{formatDate(b.received_at)}</td>
                <td>{b.expiry_date ? formatDate(b.expiry_date) : "—"}</td>
                <td>{b.quantity_received}</td>
                <td><b>{b.quantity_remaining}</b>{b.quantity_remaining === 0 && <span className="badge badge-muted ml-2">empty</span>}</td>
                <td>{formatMoney(b.cost_price)}</td>
                <td className="text-right"><button className="btn btn-ghost btn-sm" onClick={() => { setAdjusting(b); setError(null); }}>Adjust</button></td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted">📭 No stock received yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {adjusting && (
        <form onSubmit={adjust} noValidate className="card pop-in max-w-md space-y-4">
          <h2 className="font-bold">Adjust batch received {formatDate(adjusting.received_at)}</h2>
          <label className="label">
            Change (−2 for spoiled, 3 to add)
            <input className="input" inputMode="numeric" value={change} onChange={(e) => { setChange(e.target.value); setError(null); }} autoFocus />
            {after !== null && <p className={`hint ${after < 0 ? "text-danger" : ""}`}>Remaining will be <b>{after}</b></p>}
          </label>
          <label className="label">
            Reason
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Spoiled, damaged, miscount…" />
          </label>
          {error && <p role="alert" className="field-error">{error}</p>}
          <div className="flex gap-2">
            <button className="btn btn-primary">Save adjustment</button>
            <button type="button" className="btn btn-ghost" onClick={() => setAdjusting(null)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
