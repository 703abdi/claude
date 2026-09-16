"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed");
        setLoading(false);
        return;
      }
      const dest = params.get("from") || "/tasks";
      router.push(dest);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm border border-border bg-surface rounded-lg p-8 animate-fade-in"
      >
        <h1 className="text-lg font-bold tracking-tight mb-1">abdi&apos;s os</h1>
        <p className="text-sm text-muted mb-6">Private command center. Sign in to continue.</p>

        <label className="block text-xs font-medium text-muted mb-1.5">Email</label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-muted-2 transition-colors"
        />

        <label className="block text-xs font-medium text-muted mb-1.5">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-5 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-muted-2 transition-colors"
        />

        {error && (
          <p className="text-sm text-status-red mb-4" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-foreground text-background font-semibold text-sm py-2.5 disabled:opacity-50 transition-opacity"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
