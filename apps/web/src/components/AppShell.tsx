"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type User } from "@/lib/api";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/inventory", label: "Inventory" },
  { href: "/inventory/receive", label: "Receive stock" },
  { href: "/sales", label: "Sales (Phase 3)" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

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

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-black/10 px-4 py-3 dark:border-white/15">
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:underline">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="opacity-70">{user ? `${user.name} (${user.role.toLowerCase()})` : ""}</span>
          <button onClick={logout} className="rounded-md border border-black/20 px-3 py-1 dark:border-white/25">
            Log out
          </button>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </>
  );
}
