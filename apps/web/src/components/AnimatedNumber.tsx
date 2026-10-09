"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/api";

/** Counts up to `value` so changes catch the eye. Falls back to an instant jump for reduced-motion users. */
export function AnimatedNumber({ value, money = true }: { value: number; money?: boolean }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const start = from.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 0 : 700;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = duration === 0 ? 1 : Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(start + (value - start) * eased);
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className="tabular-nums">{money ? formatMoney(shown) : shown.toLocaleString("en-US")}</span>;
}
