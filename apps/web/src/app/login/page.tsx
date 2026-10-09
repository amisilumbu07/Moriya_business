"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, type User } from "@/lib/api";
import { SkinPicker } from "@/components/SkinPicker";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api<User>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
      });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Try again.");
      setShaking(true);
      setTimeout(() => setShaking(false), 450);
      setPending(false);
    }
  }

  return (
    <main className="relative flex flex-1 items-center justify-center p-4">
      <div className="absolute right-4 top-4"><SkinPicker /></div>
      <div className="page w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="float mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-2 text-3xl shadow-lg">🛒</div>
          <h1 className="gradient-text text-3xl font-extrabold">Store Tracker</h1>
          <p className="mt-1 text-sm text-muted">Stock, daily sales and weekly figures in one place.</p>
        </div>

        <form onSubmit={onSubmit} className={`card space-y-4 ${shaking ? "shake" : ""}`}>
          <label className="label">
            Username
            <input name="username" autoComplete="username" autoCapitalize="none" required maxLength={50}
              aria-invalid={!!error} className="input text-base text-foreground" />
          </label>
          <label className="label">
            Password
            <span className="relative block">
              <input name="password" type={show ? "text" : "password"} autoComplete="current-password" required maxLength={128}
                aria-invalid={!!error} className="input pr-16 text-base text-foreground" />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-primary">
                {show ? "Hide" : "Show"}
              </button>
            </span>
          </label>
          {error && <p role="alert" className="field-error">{error}</p>}
          <button type="submit" disabled={pending} className="btn btn-primary w-full">
            {pending ? "Logging in…" : "Log in"}
          </button>
        </form>
      </div>
    </main>
  );
}
