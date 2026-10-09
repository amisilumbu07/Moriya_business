"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { useFeedback } from "@/components/Feedback";
import { addDays, api, ApiError, formatDate, formatMoney, todayIso, type Week } from "@/lib/api";

export default function WeeklyPage() {
  const { toast } = useFeedback();
  const [day, setDay] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const [result, setResult] = useState<{ day: string; week: Week } | null>(null);

  useEffect(() => {
    setTimeout(() => { const t = todayIso(); setToday(t); setDay((d) => d ?? t); }, 0);
  }, []);

  useEffect(() => {
    if (!day) return;
    let cancelled = false;
    api<Week>(`/api/weekly?date=${day}`)
      .then((week) => !cancelled && setResult({ day, week }))
      .catch((e) => toast("error", e instanceof ApiError ? e.message : "Could not load the week"));
    return () => { cancelled = true; };
  }, [day, toast]);

  const week = result?.day === day ? result.week : null;
  const maxDay = week ? Math.max(1, ...week.days.map((d) => d.total_amount)) : 1;
  const missing = week && today ? week.days.filter((d) => d.mode === null && d.date <= today) : [];
  const isCurrent = !!week && !!today && week.week_start <= today && today <= week.week_end;
  const cards = week ? [
    { label: "Tithe", pct: week.tithe_percent, value: week.tithe, icon: "🙏" },
    { label: "Offering", pct: week.offering_percent, value: week.offering, icon: "🎁" },
    { label: "Remaining", pct: null, value: week.remaining, icon: "💼" },
  ] : [];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">📊 Weekly summary</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost" onClick={() => day && setDay(addDays(day, -7))} aria-label="Previous week">←</button>
          <input type="date" className="input !mt-0 !w-auto" value={day ?? ""} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Any day in the week" />
          <button className="btn btn-ghost" disabled={!week || !today || week.week_end >= today} onClick={() => day && setDay(addDays(day, 7))} aria-label="Next week">→</button>
          {!isCurrent && today && <button className="btn btn-ghost" onClick={() => setDay(today)}>This week</button>}
        </div>
      </div>

      {!week ? (
        <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-28" />)}</div>
      ) : (
        <>
          <p className="text-sm text-muted">{formatDate(week.week_start, { day: "numeric", month: "short" })} – {formatDate(week.week_end)}{isCurrent && <span className="badge badge-success ml-2">current week</span>}</p>

          <div className="card" style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-2))", border: 0, color: "var(--on-primary)" }}>
            <p className="text-sm font-semibold opacity-80">Total earnings this week</p>
            <p className="mt-1 text-4xl font-extrabold"><AnimatedNumber value={week.total} /></p>
          </div>

          {missing.length > 0 && (
            <div className="card pop-in" style={{ borderColor: "var(--warning)" }}>
              <p className="text-sm font-bold text-warning">⚠ {missing.length} day{missing.length === 1 ? " has" : "s have"} no record — these figures may be incomplete</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {missing.map((d) => <Link key={d.date} href={`/sales/${d.date}`} className="badge badge-warning">{formatDate(d.date, { weekday: "short", day: "numeric", month: "short" })} → add</Link>)}
              </div>
            </div>
          )}

          <div className="stagger grid gap-4 sm:grid-cols-3">
            {cards.map((c) => (
              <div key={c.label} className="card card-hover">
                <p className="label">{c.icon} {c.label}{c.pct !== null && <span className="badge badge-muted ml-2">{c.pct}%</span>}</p>
                <p className="mt-2 text-2xl font-extrabold"><AnimatedNumber value={c.value} /></p>
              </div>
            ))}
          </div>

          <div className="card space-y-3">
            <h2 className="font-bold">Day by day</h2>
            <ul className="stagger space-y-3">
              {week.days.map((d) => (
                <li key={d.date}>
                  <Link href={`/sales/${d.date}`} className="group block rounded-xl p-2 transition-colors hover:bg-surface-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold group-hover:text-primary">{formatDate(d.date, { weekday: "long", day: "numeric", month: "short" })}</span>
                      <span className="flex items-center gap-2">
                        {d.mode === null ? (today && d.date > today ? <span className="badge badge-muted">upcoming</span> : <span className="badge badge-warning">no record</span>)
                          : <span className={`badge ${d.mode === "DETAILED" ? "badge-success" : "badge-muted"}`}>{d.mode === "DETAILED" ? "itemised" : "total only"}</span>}
                        <b className="tabular-nums">{formatMoney(d.total_amount)}</b>
                      </span>
                    </div>
                    <div className="bar-track mt-2"><div className="bar-fill" style={{ width: `${(d.total_amount / maxDay) * 100}%` }} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted">Tithe and offering are {week.tithe_percent}% and {week.offering_percent}% of the week&apos;s total sales, rounded to the nearest unit.</p>
        </>
      )}
    </section>
  );
}
