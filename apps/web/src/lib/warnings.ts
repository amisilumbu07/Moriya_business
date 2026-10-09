import type { RestockWarning } from "@/lib/api";

export function expiryText(days: number) {
  if (days < 0) return `Expired ${-days} day${days === -1 ? "" : "s"} ago`;
  if (days === 0) return "Expires today";
  return `Expires in ${days} day${days === 1 ? "" : "s"}`;
}

export function restockText(w: RestockWarning) {
  const reason = w.reasons.includes("OUT_OF_STOCK") ? "Out of stock" : w.reasons.includes("LOW_STOCK") ? `Low stock (alert at ${w.reorder_level})` : "Selling fast";
  if (w.days_left === null) return `${reason} · no recent sales to estimate from`;
  return `${reason} · about ${w.days_left} day${w.days_left === 1 ? "" : "s"} of stock left at ${w.avg_daily_sales}/day`;
}
