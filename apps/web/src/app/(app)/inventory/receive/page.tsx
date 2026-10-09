"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, type Product } from "@/lib/api";
import { btnCls, inputCls } from "@/components/ui";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

export default function ReceiveStockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [received, setReceived] = useState("");
  const [expiry, setExpiry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Date is set after mount so it is the visitor's today, not the build date.
    setTimeout(() => setReceived((d) => d || today()), 0);
    api<Product[]>("/api/products").then(setProducts).catch(() => setError("Could not load products"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const q = Number(quantity);
    const c = Number(cost);
    if (!productId) return setError("Choose a product");
    if (!Number.isInteger(q) || q <= 0) return setError("Quantity must be a whole number above 0");
    if (!Number.isInteger(c) || c < 0) return setError("Cost price must be a whole number, 0 or more");
    if (expiry && expiry < received) return setError("Expiry date cannot be before the received date");
    try {
      await api("/api/stock/receive", {
        method: "POST",
        body: JSON.stringify({
          product_id: Number(productId),
          quantity: q,
          cost_price: c,
          received_at: received,
          expiry_date: expiry || null,
        }),
      });
      const name = products.find((p) => String(p.id) === productId)?.name;
      setMessage(`Received ${q} × ${name}.`);
      setQuantity("");
      setCost("");
      setExpiry("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    }
  }

  return (
    <section className="max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Receive stock</h1>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          Product
          <select className={inputCls} value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="">Choose…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.unit})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Quantity received
          <input className={inputCls} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </label>
        <label className="block text-sm">
          Cost price per unit (XAF)
          <input className={inputCls} inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </label>
        <label className="block text-sm">
          Date received
          <input type="date" className={inputCls} value={received} onChange={(e) => setReceived(e.target.value)} required />
        </label>
        <label className="block text-sm">
          Expiry date (optional)
          <input type="date" className={inputCls} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </label>
        <button className={btnCls}>Save batch</button>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {message && (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            {message} <Link href="/inventory" className="underline">View inventory</Link>
          </p>
        )}
      </form>
    </section>
  );
}
