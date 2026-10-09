export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Small wrapper around fetch for our FastAPI backend (same origin, cookie auth). */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail) && body.detail[0]?.msg)
        message = String(body.detail[0].msg).replace(/^Value error, /, "");
    } catch {}
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export type User = { id: number; name: string; username: string; role: "CASHIER" | "OWNER" };

export type Product = {
  id: number;
  name: string;
  category: string;
  unit: string;
  selling_price: number;
  reorder_level: number;
  is_active: boolean;
  quantity_on_hand: number;
  next_expiry: string | null;
  low_stock: boolean;
};

export type Batch = {
  id: number;
  product_id: number;
  quantity_received: number;
  quantity_remaining: number;
  cost_price: number;
  received_at: string;
  expiry_date: string | null;
};

/** Zambian Kwacha (ZMW). Change these two lines to switch currency everywhere in the UI. */
export const CURRENCY_CODE = "ZMW";
export const CURRENCY_SYMBOL = "K";
export const formatMoney = (n: number) => `${CURRENCY_SYMBOL}${n.toLocaleString("en-US")}`;

export type SaleLine = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};
export type Day = { date: string; mode: "DETAILED" | "TOTAL_ONLY"; total_amount: number; note: string; items: SaleLine[] };
export type DaySummary = { date: string; mode: "DETAILED" | "TOTAL_ONLY"; total_amount: number; item_count: number };
export type Week = {
  week_start: string;
  week_end: string;
  total: number;
  tithe: number;
  offering: number;
  remaining: number;
  tithe_percent: number;
  offering_percent: number;
  days: { date: string; mode: "DETAILED" | "TOTAL_ONLY" | null; total_amount: number }[];
};

/** Parse "YYYY-MM-DD" as a local date (new Date("2026-10-05") would be UTC and can show the wrong day). */
export function parseDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export const formatDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" }) =>
  parseDate(iso).toLocaleDateString("en-GB", opts);
export const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Only call from effects/handlers, never during render. */
export const todayIso = () => toIso(new Date());
export const addDays = (iso: string, n: number) => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
};

export type ProductStat = {
  product_id: number; name: string; category: string; unit: string;
  units: number; revenue: number; cost: number | null; profit: number | null;
};
export type Stats = {
  start: string; end: string;
  products: ProductStat[];
  categories: { category: string; units: number; revenue: number }[];
  slow_movers: { product_id: number; name: string; unit: string; units: number; quantity_on_hand: number }[];
  trend_group: "day" | "week";
  trend: { date: string; total: number }[];
  total_sales: number; revenue_itemised: number;
  detailed_days: number; total_only_days: number; total_only_total: number;
  slow_mover_max_units: number;
  profit_total: number | null; cost_total: number | null;
};

export type ExpiryWarning = {
  batch_id: number; product_id: number; product_name: string; unit: string;
  quantity_remaining: number; expiry_date: string; days_left: number;
  severity: "red" | "orange" | "yellow"; handled: boolean;
};
export type RestockWarning = {
  product_id: number; product_name: string; unit: string; quantity_on_hand: number; reorder_level: number;
  avg_daily_sales: number; days_left: number | null;
  reasons: ("OUT_OF_STOCK" | "LOW_STOCK" | "SELLING_FAST")[]; handled: boolean;
};
export type Warnings = {
  expiry: ExpiryWarning[]; restock: RestockWarning[]; counts: { expiry: number; restock: number };
};

export type ReportListItem = { week_start: string; week_end: string; generated_at: string };
export type Report = ReportListItem & {
  week: Week;
  top_products: { name: string; unit: string; units: number; revenue: number }[];
  total_only_days: number;
  warnings: Warnings;
  slow_movers: Stats["slow_movers"];
};

export const formatPercent = (n: number) => `${n.toFixed(1)}%`;
