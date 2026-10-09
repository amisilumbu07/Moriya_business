"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type User, type Warnings } from "@/lib/api";
import { useFeedback } from "@/components/Feedback";
import { SkinPicker } from "@/components/SkinPicker";

const NAV = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/products", label: "Products", icon: "🏷️" },
  { href: "/inventory", label: "Inventory", icon: "📦" },
  { href: "/sales", label: "Sales", icon: "🧾" },
  { href: "/weekly", label: "Weekly", icon: "📊" },
  { href: "/stats", label: "Stats", icon: "📈" },
  { href: "/warnings", label: "Warnings", icon: "⚠️" },
  { href: "/reports", label: "Reports", icon: "🗂️" },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { confirm } = useFeedback();
  const [user, setUser] = useState<User | null>(null);
  const [alerts, setAlerts] = useState(0);

  useEffect(() => {
    api<User>("/api/auth/me")
      .then(setUser)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          // Stale cookie: the proxy let us in but the backend says no.
          document.cookie = "session=; Max-Age=0; path=/";
          router.replace("/login");
        }
      });
  }, [router]);

  // Refresh the warning count on every page change so the badge stays honest.
  useEffect(() => {
    const refresh = () =>
      api<Warnings>("/api/warnings")
        .then((w) => setAlerts(w.counts.expiry + w.counts.restock))
        .catch(() => {});
    refresh();
    window.addEventListener("warnings-changed", refresh);
    return () => window.removeEventListener("warnings-changed", refresh);
  }, [pathname]);

  async function logout() {
    const ok = await confirm({ title: "Log out?", message: "You will need to log in again.", confirmLabel: "Log out" });
    if (!ok) return;
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <header className="glass sticky top-0 z-40 border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 text-lg font-extrabold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-2 text-lg shadow-md">🛒</span>
            <span className="gradient-text">Store Tracker</span>
          </Link>
          <div className="flex items-center gap-4">
            <SkinPicker />
            <span className="hidden text-sm text-muted sm:block">
              {user ? `${user.name} · ${user.role.toLowerCase()}` : ""}
            </span>
            <button onClick={logout} className="btn btn-ghost btn-sm">Log out</button>
          </div>
          <nav aria-label="Main" className="-mx-1 flex w-full gap-1 overflow-x-auto px-1 pb-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
              >
                <span aria-hidden className="mr-1.5">{item.icon}</span>
                {item.label}
                {item.href === "/warnings" && alerts > 0 && (
                  <span className="badge badge-danger badge-pulse ml-2" aria-label={`${alerts} warnings`}>{alerts}</span>
                )}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main key={pathname} className="page mx-auto w-full max-w-6xl flex-1 p-4 pb-16">{children}</main>
    </>
  );
}
