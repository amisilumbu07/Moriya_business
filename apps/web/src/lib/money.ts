/**
 * Money is whole NGWEE everywhere (1 kwacha = 100 ngwee, so K12.50 is 1250).
 * The API sends and receives ngwee; people only ever see and type kwacha with up to 2 decimals.
 */
export const CURRENCY_CODE = "ZMW";
export const CURRENCY_SYMBOL = "K";
export const MONEY_HINT = "e.g. 12 or 12.50";

/** 150000 -> "K1,500.00". Integer maths only, so there is never a float rounding error. */
export function formatMoney(ngwee: number): string {
  const abs = Math.abs(Math.round(ngwee));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${ngwee < 0 ? "−" : ""}${CURRENCY_SYMBOL}${whole.toLocaleString("en-US")}.${frac}`;
}

/** "12.5" -> 1250. Returns null for anything that is not a plain amount with at most 2 decimals. */
export function parseMoney(text: string): number | null {
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** Why `text` is not a valid amount (so the form can say something useful), or null if it is fine. */
export function moneyProblem(text: string): string | null {
  if (!text.trim()) return "Enter an amount";
  if (text.includes(",")) return "Use a dot for the decimal point and no commas, e.g. 1500.50";
  if (/^\d+\.\d{3,}$/.test(text.trim())) return "At most 2 decimals (ngwee), e.g. 12.50";
  if (parseMoney(text) === null) return `Enter an amount like 12 or 12.50`;
  return null;
}

/** 1250 -> "12.50", 1500 -> "15" (for putting an existing amount back into an input). */
export function toInputMoney(ngwee: number): string {
  const whole = Math.floor(ngwee / 100);
  const frac = ngwee % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0")}`;
}
