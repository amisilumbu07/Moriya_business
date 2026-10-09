"use client";

import { useEffect, useState } from "react";
import { api, ApiError, formatMoney, type Product } from "@/lib/api";
import { btnCls, btnGhostCls, inputCls, tdCls, thCls } from "@/components/ui";

const emptyForm = { name: "", category: "", unit: "piece", selling_price: "", reorder_level: "0" };

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    const qs = new URLSearchParams({ search, category, include_inactive: String(showInactive) });
    Promise.all([api<Product[]>(`/api/products?${qs}`), api<string[]>("/api/categories")])
      .then(([p, c]) => {
        setProducts(p);
        setCategories(c);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load products"))
      .finally(() => setLoading(false));
  }, [search, category, showInactive, reloadKey]);

  function startEdit(p: Product | null) {
    setEditing(p);
    setError(null);
    setForm(
      p
        ? {
            name: p.name,
            category: p.category,
            unit: p.unit,
            selling_price: String(p.selling_price),
            reorder_level: String(p.reorder_level),
          }
        : emptyForm,
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const price = Number(form.selling_price);
    const reorder = Number(form.reorder_level);
    if (!Number.isInteger(price) || price < 0 || !Number.isInteger(reorder) || reorder < 0) {
      setError("Price and reorder level must be whole numbers, 0 or more");
      return;
    }
    const body = JSON.stringify({ ...form, selling_price: price, reorder_level: reorder });
    try {
      await api(editing ? `/api/products/${editing.id}` : "/api/products", {
        method: editing ? "PATCH" : "POST",
        body,
      });
      startEdit(null);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    }
  }

  async function setActive(p: Product, is_active: boolean) {
    await api(`/api/products/${p.id}`, { method: "PATCH", body: JSON.stringify({ is_active }) });
    reload();
  }

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Products</h1>

      <form onSubmit={save} className="grid gap-3 rounded-lg border border-black/10 p-4 sm:grid-cols-6 dark:border-white/15">
        <h2 className="text-sm font-semibold sm:col-span-6">{editing ? `Edit “${editing.name}”` : "Add a product"}</h2>
        <label className="text-sm sm:col-span-2">
          Name
          <input className={inputCls} value={form.name} onChange={set("name")} required maxLength={100} />
        </label>
        <label className="text-sm">
          Category
          <input className={inputCls} value={form.category} onChange={set("category")} list="cats" maxLength={50} />
          <datalist id="cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="text-sm">
          Unit
          <input className={inputCls} value={form.unit} onChange={set("unit")} required maxLength={20} />
        </label>
        <label className="text-sm">
          Selling price (XAF)
          <input className={inputCls} inputMode="numeric" value={form.selling_price} onChange={set("selling_price")} required />
        </label>
        <label className="text-sm">
          Reorder level
          <input className={inputCls} inputMode="numeric" value={form.reorder_level} onChange={set("reorder_level")} required />
        </label>
        <div className="flex items-end gap-2 sm:col-span-6">
          <button className={btnCls}>{editing ? "Save changes" : "Add product"}</button>
          {editing && (
            <button type="button" className={btnGhostCls} onClick={() => startEdit(null)}>
              Cancel
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600 sm:col-span-6 dark:text-red-400">
            {error}
          </p>
        )}
      </form>

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
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show deactivated
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-black/10 dark:border-white/15">
            <tr>
              <th className={thCls}>Name</th>
              <th className={thCls}>Category</th>
              <th className={thCls}>Unit</th>
              <th className={thCls}>Price</th>
              <th className={thCls}>Reorder at</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={`border-b border-black/5 dark:border-white/10 ${p.is_active ? "" : "opacity-50"}`}>
                <td className={tdCls}>
                  {p.name}
                  {!p.is_active && <span className="ml-2 text-xs">(deactivated)</span>}
                </td>
                <td className={tdCls}>{p.category || "—"}</td>
                <td className={tdCls}>{p.unit}</td>
                <td className={tdCls}>{formatMoney(p.selling_price)}</td>
                <td className={tdCls}>{p.reorder_level}</td>
                <td className={`${tdCls} space-x-2 whitespace-nowrap text-right`}>
                  <button className={btnGhostCls} onClick={() => startEdit(p)}>
                    Edit
                  </button>
                  <button className={btnGhostCls} onClick={() => setActive(p, !p.is_active)}>
                    {p.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && products.length === 0 && (
              <tr>
                <td className={tdCls} colSpan={6}>
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
