"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, type User } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      setPending(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 p-6 dark:border-white/15"
      >
        <h1 className="text-xl font-semibold">Store Tracker</h1>
        <p className="text-sm opacity-70">Log in to continue.</p>

        <label className="block text-sm font-medium">
          Username
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            required
            maxLength={50}
            className="mt-1 w-full rounded-md border border-black/20 bg-transparent px-3 py-2 dark:border-white/25"
          />
        </label>

        <label className="block text-sm font-medium">
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            className="mt-1 w-full rounded-md border border-black/20 bg-transparent px-3 py-2 dark:border-white/25"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-foreground px-3 py-2 font-medium text-background disabled:opacity-50"
        >
          {pending ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
