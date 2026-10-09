"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { useFeedback } from "@/components/Feedback";
import { api, ApiError, formatDate, formatMoney, todayIso, type Day, type Product } from "@/lib/api";

type Row = { key: number; productId: string; qty: string; price: string };
type Mode = "DETAILED" | "TOTAL_ONLY";
type Loaded = { date: string; products: Product[]; day: Day | null };

const isWhole = (v: string) => /^\d+$/.test(v.trim());
let rowKey = 1;
const blankRow = (): Row => ({ key: rowKey++, productId: "", qty: "1", price: "" });

export default function SalesEntry({ date }: { date: string }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mode, setMode] = useState<Mode>("DETAILED");
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [totalText, setTotalText] = useState("");
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const [freshRow, setFreshRow] = useState<number | null>(null);
  const [today, setToday] = useState("");
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  // "today" is a friendly alias that resolves to the real date in the visitor's time zone.
  useEffect(() => {
    if (date === "today") router.replace(`/sales/${todayIso()}`);
    else setTimeout(() => setToday(todayIso()), 0);
  }, [date, router]);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    Promise.all([
      api<Product[]>("/api/products?include_inactive=true"),
      api<Day>(`/api/sales/${date}`).catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
    ])
      .then(([products, day]) => {
        if (cancelled) return;
        setLoaded({ date, products, day });
        setMode(day?.mode ?? "DETAILED");
        setRows(day && day.mode === "DETAILED"
          ? day.items.map((i) => ({ key: rowKey++, productId: String(i.product_id), qty: String(i.quantity), price: String(i.unit_price) }))
          : [blankRow()]);
        setTotalText(day?.mode === "TOTAL_ONLY" ? String(day.total_amount) : "");
        setNote(day?.note ?? "");
        setDirty(false);
        setTried(false);
      })
      .catch((e) => toast("error", e instanceof ApiError ? e.message : "Could not load this day"));
    return () => { cancelled = true; };
  }, [date, valid, toast]);

  // Warn before closing the tab with unsaved work.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const ready = loaded?.date === date ? loaded : null;
  const products = useMemo(() => ready?.products ?? [], [ready]);
  const existing = ready?.day ?? null;

  // Stock the cashier can sell = what is on the shelf + what this saved day already took out.
  const available = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of products) map.set(p.id, p.quantity_on_hand);
    if (existing?.mode === "DETAILED")
      for (const i of existing.items) map.set(i.product_id, (map.get(i.product_id) ?? 0) + i.quantity);
    return map;
  }, [products, existing]);

  const sellable = products.filter((p) => p.is_active || existing?.items.some((i) => i.product_id === p.id));

  // Per-row problems, computed live.
  const rowInfo = rows.map((r, idx) => {
    const pid = Number(r.productId);
    const product = products.find((p) => p.id === pid);
    const qty = Number(r.qty);
    const priceOk = isWhole(r.price);
    const qtyOk = isWhole(r.qty) && qty > 0;
    const usedByRowsBefore = rows.slice(0, idx + 1).filter((x) => x.productId === r.productId).reduce((s, x) => s + (isWhole(x.qty) ? Number(x.qty) : 0), 0);
    const avail = product ? available.get(product.id) ?? 0 : 0;
    let error: string | null = null;
    if (!product) error = "Choose a product";
    else if (!qtyOk) error = "Quantity must be a whole number above 0";
    else if (!priceOk) error = "Enter the price";
    else if (usedByRowsBefore > avail) error = avail === 0 ? `${product.name} is out of stock` : `Only ${avail} ${product.unit} available`;
    const duplicate = !!product && rows.slice(0, idx).some((x) => x.productId === r.productId);
    const line = qtyOk && priceOk ? qty * Number(r.price) : 0;
    const priceDiffers = !!product && priceOk && Number(r.price) !== product.selling_price;
    return { product, error, duplicate, line, priceDiffers, avail };
  });

  const detailedTotal = rowInfo.reduce((s, r) => s + r.line, 0);
  const totalOnlyOk = isWhole(totalText);
  const total = mode === "DETAILED" ? detailedTotal : totalOnlyOk ? Number(totalText) : 0;
  const problems = mode === "DETAILED" ? rowInfo.filter((r) => r.error).length : totalOnlyOk ? 0 : 1;
  const canSave = !saving && problems === 0 && (mode === "DETAILED" ? rows.length > 0 : true);

  function touch<T>(setter: (v: T) => void) { return (v: T) => { setter(v); setDirty(true); }; }
  const updateRow = (key: number, patch: Partial<Row>) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))); setDirty(true); };
  function addRow() { const r = blankRow(); setRows((rs) => [...rs, r]); setFreshRow(r.key); setDirty(true); }
  function removeRow(key: number) { setRows((rs) => (rs.length === 1 ? [blankRow()] : rs.filter((r) => r.key !== key))); setDirty(true); }
  function pickProduct(key: number, productId: string) {
    const p = products.find((x) => String(x.id) === productId);
    updateRow(key, { productId, price: p ? String(p.selling_price) : "" });
  }

  async function goToDate(next: string) {
    if (!next || next === date) return;
    if (dirty && !(await confirm({ title: "Leave without saving?", message: "You have unsaved changes for this day.", confirmLabel: "Leave", danger: true }))) return;
    setDirty(false);
    router.push(`/sales/${next}`);
  }

  async function leave(e: React.MouseEvent) {
    if (!dirty) return;
    e.preventDefault();
    if (await confirm({ title: "Leave without saving?", message: "You have unsaved changes for this day.", confirmLabel: "Leave", danger: true })) {
      setDirty(false);
      router.push("/sales");
    }
  }

  async function save() {
    setTried(true);
    if (!canSave) {
      toast("error", mode === "DETAILED" ? "Fix the highlighted items first" : "Enter the day's total");
      return;
    }
    const switching = existing?.mode === "DETAILED" && mode === "TOTAL_ONLY";
    const ok = await confirm({
      title: existing ? `Update ${formatDate(date)}?` : `Save ${formatDate(date)}?`,
      message: (
        <div className="space-y-2">
          <p className="text-2xl font-extrabold text-foreground">{formatMoney(total)}</p>
          <p>{mode === "DETAILED" ? `${rows.length} item line${rows.length === 1 ? "" : "s"} · stock will be reduced automatically.` : "Total only · stock is not changed."}</p>
          {existing && <p>This replaces what was recorded before ({formatMoney(existing.total_amount)}).</p>}
          {switching && <p className="font-semibold text-warning">Switching to total-only puts the earlier items back into stock.</p>}
        </div>
      ),
      confirmLabel: existing ? "Update" : "Save sales",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const body = mode === "DETAILED"
        ? { mode, note, items: rows.map((r) => ({ product_id: Number(r.productId), quantity: Number(r.qty), unit_price: Number(r.price) })) }
        : { mode, note, total_amount: Number(totalText) };
      const saved = await api<Day>(`/api/sales/${date}`, { method: "PUT", body: JSON.stringify(body) });
      toast("success", `Saved ${formatDate(date)} — ${formatMoney(saved.total_amount)}`);
      setDirty(false);
      dirtyRef.current = false;
      router.push("/sales");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Could not save. Nothing was changed.");
      // Refresh stock numbers so the form shows the truth after a rejected save.
      api<Product[]>("/api/products?include_inactive=true").then((p) => setLoaded((l) => (l ? { ...l, products: p } : l))).catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing) return;
    const ok = await confirm({
      title: `Delete ${formatDate(date)}?`,
      message: existing.mode === "DETAILED" ? "The sold items will be put back into stock. This cannot be undone." : "The recorded total will be removed. This cannot be undone.",
      confirmLabel: "Delete day", danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/sales/${date}`, { method: "DELETE" });
      toast("success", `${formatDate(date)} deleted`);
      dirtyRef.current = false;
      router.push("/sales");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Could not delete");
    }
  }

  if (date === "today") return <div className="skeleton h-40" />;
  if (!valid) return <p role="alert" className="field-error">“{date}” is not a valid date. <Link href="/sales" className="underline">Back to sales</Link></p>;
  if (!ready) return <div className="space-y-3"><div className="skeleton h-16" /><div className="skeleton h-64" /></div>;

  const future = today && date > today;

  return (
    <section className="space-y-5">
      <Link href="/sales" onClick={leave} className="text-sm font-semibold text-primary">← All sales</Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{formatDate(date)}</h1>
          <span className={`badge mt-1 ${existing ? "badge-success" : "badge-muted"}`}>{existing ? "✓ Recorded — editing" : "New day"}</span>
          {dirty && <span className="badge badge-warning ml-2">Unsaved changes</span>}
        </div>
        <label className="label">Day
          <input type="date" className="input !w-auto" value={date} max={today || undefined} onChange={(e) => goToDate(e.target.value)} />
        </label>
      </div>
      {future && <p className="field-error">⚠ This date is in the future.</p>}

      <div className="seg" role="group" aria-label="How do you want to record this day?">
        <button type="button" aria-pressed={mode === "DETAILED"} onClick={() => touch(setMode)("DETAILED")}>🧺 Itemised</button>
        <button type="button" aria-pressed={mode === "TOTAL_ONLY"} onClick={() => touch(setMode)("TOTAL_ONLY")}>💰 Day total only</button>
      </div>

      {mode === "DETAILED" ? (
        <div className="space-y-3">
          {rows.map((r, idx) => {
            const info = rowInfo[idx];
            const showErr = info.error && (tried || r.productId);
            return (
              <div key={r.key} className={`card pop-in grid items-start gap-3 sm:grid-cols-[1fr_6rem_8rem_8rem_auto] ${showErr && tried ? "shake" : ""}`}
                style={showErr && tried ? { borderColor: "var(--danger)" } : undefined}>
                <label className="label">Product
                  <select className="input" value={r.productId} autoFocus={freshRow === r.key} onChange={(e) => pickProduct(r.key, e.target.value)} aria-invalid={!!(tried && !info.product)}>
                    <option value="">Choose…</option>
                    {sellable.map((p) => {
                      const a = available.get(p.id) ?? 0;
                      return <option key={p.id} value={p.id} disabled={a === 0 && String(p.id) !== r.productId}>{p.name} — {a} {p.unit} in stock{a === 0 ? " (out)" : ""}</option>;
                    })}
                  </select>
                  {info.duplicate && <p className="hint text-warning">⚠ Already on an earlier line — quantities add up.</p>}
                </label>
                <label className="label">Qty
                  <input className="input" inputMode="numeric" value={r.qty} onChange={(e) => updateRow(r.key, { qty: e.target.value })} aria-invalid={!!(info.error && info.product && !isWhole(r.qty) || (info.error?.includes("available") || info.error?.includes("out of stock")))} />
                </label>
                <label className="label">Price (XAF)
                  <input className="input" inputMode="numeric" value={r.price} onChange={(e) => updateRow(r.key, { price: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (idx === rows.length - 1) addRow(); } }} aria-invalid={!!(tried && !isWhole(r.price))} />
                  {info.priceDiffers && info.product && <p className="hint text-warning">List price {formatMoney(info.product.selling_price)}</p>}
                </label>
                <div className="label">Line total
                  <p className="mt-2 flex min-h-11 items-center text-lg font-extrabold text-foreground tabular-nums">{formatMoney(info.line)}</p>
                </div>
                <button type="button" className="btn btn-ghost btn-sm mt-6 self-start" onClick={() => removeRow(r.key)} aria-label="Remove this line">✕</button>
                {showErr && <p role="alert" className="field-error sm:col-span-5">{info.error}</p>}
              </div>
            );
          })}
          <button type="button" className="btn btn-ghost" onClick={addRow}>➕ Add another item</button>
        </div>
      ) : (
        <div className="card pop-in max-w-md space-y-2">
          <label className="label">Total sales for the day (XAF)
            <input className="input text-xl font-bold" inputMode="numeric" value={totalText} onChange={(e) => touch(setTotalText)(e.target.value)} autoFocus
              aria-invalid={tried && !totalOnlyOk} placeholder="e.g. 45000" />
          </label>
          {totalText && !totalOnlyOk && <p className="field-error">Use digits only, no spaces or commas.</p>}
          {tried && !totalText && <p className="field-error">Enter the day&apos;s total.</p>}
          <p className="hint">Stock is not changed in this mode.</p>
        </div>
      )}

      <label className="label max-w-xl">Note (optional)
        <input className="input" value={note} maxLength={300} onChange={(e) => touch(setNote)(e.target.value)} placeholder="Anything worth remembering about this day" />
      </label>

      <div className="card sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-3 glass" style={{ borderColor: "color-mix(in srgb, var(--primary) 40%, var(--line))" }}>
        <div>
          <p className="label">Day total</p>
          <p className="gradient-text text-3xl font-extrabold"><AnimatedNumber value={total} /></p>
        </div>
        <div className="flex gap-2">
          {existing && <button type="button" className="btn btn-ghost" onClick={remove}>🗑 Delete day</button>}
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : existing ? "Update day" : "Save day"}</button>
        </div>
      </div>
    </section>
  );
}
