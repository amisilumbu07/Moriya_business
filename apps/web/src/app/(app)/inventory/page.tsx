"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, type Product } from "@/lib/api";
import { btnCls, inputCls, tdCls, thCls } from "@/components/ui";

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<string[]>("/api/categories").then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams({ search, category });
    api<Product[]>(`/api/products?${qs}`)
      .then((p) => {
        setProducts(p);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load inventory"))
      .finally(() => setLoading(false));
  }, [search, category]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <Link href="/inventory/receive" className={btnCls}>
          Receive stock
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Search
          <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name…" />
        </label>
        <label className="text-sm">
          Category
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-black/10 dark:border-white/15">
            <tr>
              <th className={thCls}>Product</th>
              <th className={thCls}>Category</th>
              <th className={thCls}>On hand</th>
              <th className={thCls}>Next expiry</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-black/5 dark:border-white/10">
                <td className={tdCls}>{p.name}</td>
                <td className={tdCls}>{p.category || "—"}</td>
                <td className={tdCls}>
                  {p.quantity_on_hand} {p.unit}
                  {p.low_stock && (
                    <span className="ml-2 rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white">Low stock</span>
                  )}
                </td>
                <td className={tdCls}>{p.next_expiry ?? "—"}</td>
                <td className={`${tdCls} text-right`}>
                  <Link href={`/inventory/${p.id}`} className="underline">
                    Batches
                  </Link>
                </td>
              </tr>
            ))}
            {!loading && products.length === 0 && (
              <tr>
                <td className={tdCls} colSpan={5}>
                  No products yet. Add some on the Products page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
