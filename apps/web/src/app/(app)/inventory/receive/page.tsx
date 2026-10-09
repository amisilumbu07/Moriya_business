"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, formatDate, formatMoney, todayIso, type Product } from "@/lib/api";
import { useFeedback } from "@/components/Feedback";
import { moneyProblem, parseMoney } from "@/lib/money";

type Errors = Partial<Record<"product" | "quantity" | "cost" | "expiry", string>>;

export default function ReceiveStockPage() {
  const { toast, confirm } = useFeedback();
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [received, setReceived] = useState("");
  const [expiry, setExpiry] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    // Set after mount so it is the visitor's today, not the build date.
    setTimeout(() => setReceived((d) => d || todayIso()), 0);
    api<Product[]>("/api/products").then(setProducts).catch(() => toast("error", "Could not load products"));
  }, [toast]);

  const product = products.find((p) => String(p.id) === productId);
  const costNum = parseMoney(cost);
  const costWarning = product && costNum !== null && costNum > product.selling_price
    ? `Cost (${formatMoney(costNum)}) is higher than the selling price (${formatMoney(product.selling_price)}). Double-check it.` : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = Number(quantity);
    const errs: Errors = {};
    if (!productId) errs.product = "Choose a product";
    if (!/^\d+$/.test(quantity) || q <= 0) errs.quantity = "Enter a whole number above 0";
    const costProblem = moneyProblem(cost);
    if (costProblem) errs.cost = costProblem;
    if (expiry && expiry < received) errs.expiry = "Expiry can't be before the received date";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (costWarning && !(await confirm({ title: "Check the cost price", message: costWarning, confirmLabel: "Save anyway" }))) return;
    setSaving(true);
    try {
      await api("/api/stock/receive", {
        method: "POST",
        body: JSON.stringify({ product_id: Number(productId), quantity: q, cost_price: costNum, received_at: received, expiry_date: expiry || null }),
      });
      toast("success", `Received ${q} ${product?.unit ?? ""} of ${product?.name}`);
      setProducts(await api<Product[]>("/api/products"));
      setQuantity(""); setCost(""); setExpiry(""); setFlash((f) => f + 1);
    } catch (err) {
      toast("error", err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const err = (k: keyof Errors) => errors[k] && <p role="alert" className="field-error">{errors[k]}</p>;
  const clear = (k: keyof Errors) => () => errors[k] && setErrors({ ...errors, [k]: undefined });

  return (
    <section className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-extrabold">📦 Receive stock</h1>
      <form key={flash} onSubmit={submit} noValidate className={`card space-y-4 ${flash ? "pop-in" : ""}`}>
        <label className="label">
          Product
          <select className="input" value={productId} onChange={(e) => { setProductId(e.target.value); clear("product")(); }} aria-invalid={!!errors.product}>
            <option value="">Choose…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
          </select>
          {err("product")}
          {product && <p className="hint">Currently in stock: <b>{product.quantity_on_hand} {product.unit}</b> · selling at {formatMoney(product.selling_price)}</p>}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="label">
            Quantity received
            <input className="input" inputMode="numeric" value={quantity} onChange={(e) => { setQuantity(e.target.value); clear("quantity")(); }} aria-invalid={!!errors.quantity} />
            {err("quantity")}
          </label>
          <label className="label">
            Cost per unit (K)
            <input className="input" inputMode="decimal" placeholder="8.75" value={cost} onChange={(e) => { setCost(e.target.value); clear("cost")(); }} aria-invalid={!!errors.cost} />
            {err("cost")}
            {costWarning && <p className="hint text-warning">⚠ Higher than the selling price</p>}
          </label>
          <label className="label">
            Date received
            <input type="date" className="input" value={received} onChange={(e) => setReceived(e.target.value)} />
          </label>
          <label className="label">
            Expiry date (optional)
            <input type="date" className="input" value={expiry} onChange={(e) => { setExpiry(e.target.value); clear("expiry")(); }} aria-invalid={!!errors.expiry} />
            {err("expiry")}
            {expiry && !errors.expiry && <p className="hint">Expires {formatDate(expiry)}</p>}
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save batch"}</button>
          <Link href="/inventory" className="btn btn-ghost">View inventory</Link>
        </div>
      </form>
    </section>
  );
}
