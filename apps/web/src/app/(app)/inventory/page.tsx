"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, formatDate, type Product } from "@/lib/api";
import { useFeedback } from "@/components/Feedback";

export default function InventoryPage() {
  const { toast } = useFeedback();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<string[]>("/api/categories").then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams({ search, category });
    api<Product[]>(`/api/products?${qs}`)
      .then(setProducts)
      .catch((e) => toast("error", e instanceof ApiError ? e.message : "Could not load inventory"))
      .finally(() => setLoading(false));
  }, [search, category, toast]);

  const shown = lowOnly ? products.filter((p) => p.low_stock) : products;
  const lowCount = products.filter((p) => p.low_stock).length;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Inventory</h1>
        <Link href="/inventory/receive" className="btn btn-primary">📦 Receive stock</Link>
      </div>

      {lowCount > 0 && (
        <button onClick={() => setLowOnly(!lowOnly)} className="card card-hover flex w-full items-center gap-3 text-left" style={{ borderColor: "var(--danger)" }}>
          <span className="badge badge-danger badge-pulse">{lowCount}</span>
          <span className="text-sm font-semibold">{lowCount === 1 ? "product is" : "products are"} running low — {lowOnly ? "show all" : "show only these"}</span>
        </button>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="label">Search<input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Name…" /></label>
        <label className="label">Category
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>

      <div className="card overflow-x-auto p-2">
        <table className="table">
          <thead><tr><th>Product</th><th>Category</th><th>On hand</th><th>Next expiry</th><th></th></tr></thead>
          <tbody>
            {loading && [0, 1, 2].map((i) => <tr key={i}><td colSpan={5}><div className="skeleton h-6" /></td></tr>)}
            {shown.map((p) => (
              <tr key={p.id}>
                <td className="font-semibold">{p.name}</td>
                <td>{p.category || "—"}</td>
                <td className="whitespace-nowrap">
                  <b>{p.quantity_on_hand}</b> {p.unit}
                  {p.low_stock && <span className="badge badge-danger badge-pulse ml-2">{p.quantity_on_hand === 0 ? "Out of stock" : "Low stock"}</span>}
                </td>
                <td>{p.next_expiry ? formatDate(p.next_expiry) : "—"}</td>
                <td className="text-right"><Link href={`/inventory/${p.id}`} className="btn btn-ghost btn-sm">Batches</Link></td>
              </tr>
            ))}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={5} className="py-10 text-center text-muted">📭 Nothing to show. Add products first, then receive stock.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
