"use client";

import { useEffect, useState } from "react";
import { api, ApiError, formatMoney, type Product } from "@/lib/api";
import { useFeedback } from "@/components/Feedback";

const emptyForm = { name: "", category: "", unit: "piece", selling_price: "", reorder_level: "0" };
type Errors = Partial<Record<keyof typeof emptyForm, string>>;

const isWhole = (v: string) => /^\d+$/.test(v.trim());

export default function ProductsPage() {
  const { toast, confirm } = useFeedback();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [justSaved, setJustSaved] = useState<number | null>(null);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    const qs = new URLSearchParams({ search, category, include_inactive: String(showInactive) });
    Promise.all([api<Product[]>(`/api/products?${qs}`), api<string[]>("/api/categories")])
      .then(([p, c]) => {
        setProducts(p);
        setCategories(c);
      })
      .catch((e) => toast("error", e instanceof ApiError ? e.message : "Could not load products"))
      .finally(() => setLoading(false));
  }, [search, category, showInactive, reloadKey, toast]);

  function startEdit(p: Product | null) {
    setEditing(p);
    setErrors({});
    setForm(p ? { name: p.name, category: p.category, unit: p.unit, selling_price: String(p.selling_price), reorder_level: String(p.reorder_level) } : emptyForm);
    if (p) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const duplicate = products.find(
    (p) => p.name.trim().toLowerCase() === form.name.trim().toLowerCase() && p.id !== editing?.id,
  );

  function validate(): Errors {
    const e: Errors = {};
    if (!form.name.trim()) e.name = "Enter the product name";
    if (!form.unit.trim()) e.unit = "Enter a unit, e.g. piece or kg";
    if (!isWhole(form.selling_price)) e.selling_price = "Enter the price as a whole number, e.g. 1500";
    if (!isWhole(form.reorder_level)) e.reorder_level = "Enter a whole number (0 if you don't need an alert)";
    return e;
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    if (duplicate && !(await confirm({ title: "Similar product exists", message: `“${duplicate.name}” is already in your list. Add another one with the same name?`, confirmLabel: "Add anyway" }))) return;
    try {
      const saved = await api<Product>(editing ? `/api/products/${editing.id}` : "/api/products", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ ...form, selling_price: Number(form.selling_price), reorder_level: Number(form.reorder_level) }),
      });
      toast("success", editing ? `Saved changes to ${saved.name}` : `Added ${saved.name}`);
      setJustSaved(saved.id);
      startEdit(null);
      reload();
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : "Could not save");
    }
  }

  async function setActive(p: Product, is_active: boolean) {
    if (!is_active) {
      const ok = await confirm({
        title: `Deactivate ${p.name}?`,
        message: "It will disappear from dropdowns and can't be sold or restocked. Past records keep it, and you can reactivate it any time.",
        confirmLabel: "Deactivate",
        danger: true,
      });
      if (!ok) return;
    }
    await api(`/api/products/${p.id}`, { method: "PATCH", body: JSON.stringify({ is_active }) });
    toast("info", is_active ? `${p.name} reactivated` : `${p.name} deactivated`);
    reload();
  }

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value });
    if (errors[k]) setErrors({ ...errors, [k]: undefined });
  };
  const err = (k: keyof typeof emptyForm) => errors[k] && <p role="alert" className="field-error">{errors[k]}</p>;

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-extrabold">Products</h1>

      <form onSubmit={save} noValidate className="card grid gap-4 sm:grid-cols-6">
        <h2 className="font-bold sm:col-span-6">{editing ? `✏️ Editing “${editing.name}”` : "➕ Add a product"}</h2>
        <label className="label sm:col-span-2">
          Name
          <input className="input" value={form.name} onChange={set("name")} maxLength={100} aria-invalid={!!errors.name} />
          {err("name")}
          {duplicate && !errors.name && <p className="hint text-warning">⚠ “{duplicate.name}” already exists.</p>}
        </label>
        <label className="label">
          Category
          <input className="input" value={form.category} onChange={set("category")} list="cats" maxLength={50} />
          <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="label">
          Unit
          <input className="input" value={form.unit} onChange={set("unit")} maxLength={20} aria-invalid={!!errors.unit} />
          {err("unit")}
        </label>
        <label className="label">
          Price (K)
          <input className="input" inputMode="numeric" value={form.selling_price} onChange={set("selling_price")} aria-invalid={!!errors.selling_price} />
          {err("selling_price")}
          {isWhole(form.selling_price) && <p className="hint">{formatMoney(Number(form.selling_price))}</p>}
        </label>
        <label className="label">
          Alert when stock ≤
          <input className="input" inputMode="numeric" value={form.reorder_level} onChange={set("reorder_level")} aria-invalid={!!errors.reorder_level} />
          {err("reorder_level")}
        </label>
        <div className="flex gap-2 sm:col-span-6">
          <button className="btn btn-primary">{editing ? "Save changes" : "Add product"}</button>
          {editing && <button type="button" className="btn btn-ghost" onClick={() => startEdit(null)}>Cancel</button>}
        </div>
      </form>

      <div className="flex flex-wrap items-end gap-3">
        <label className="label">Search<input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Name…" /></label>
        <label className="label">Category
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show deactivated
        </label>
      </div>

      <div className="card overflow-x-auto p-2">
        <table className="table">
          <thead><tr><th>Name</th><th>Category</th><th>Unit</th><th>Price</th><th>Alert at</th><th></th></tr></thead>
          <tbody>
            {loading && [0, 1, 2].map((i) => <tr key={i}><td colSpan={6}><div className="skeleton h-6" /></td></tr>)}
            {products.map((p) => (
              <tr key={p.id} className={`${p.is_active ? "" : "opacity-50"} ${justSaved === p.id ? "row-new" : ""}`}>
                <td className="font-semibold">{p.name}{!p.is_active && <span className="badge badge-muted ml-2">deactivated</span>}</td>
                <td>{p.category || "—"}</td>
                <td>{p.unit}</td>
                <td>{formatMoney(p.selling_price)}</td>
                <td>{p.reorder_level}</td>
                <td className="space-x-2 whitespace-nowrap text-right">
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(p)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setActive(p, !p.is_active)}>{p.is_active ? "Deactivate" : "Reactivate"}</button>
                </td>
              </tr>
            ))}
            {!loading && products.length === 0 && (
              <tr><td colSpan={6} className="py-10 text-center text-muted">📭 No products found. Add your first one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
