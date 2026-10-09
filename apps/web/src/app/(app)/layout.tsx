import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // usePathname() (active nav link) is only known at request time on dynamic routes.
  return (
    <Suspense fallback={<div className="skeleton m-4 h-24" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
