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

export const formatMoney = (n: number) => `${n.toLocaleString("en-US")} XAF`;
