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
      const dest = params.get("from") || "/hub";
      router.push(dest);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  const inputClass =
    "type-box w-full bg-surface-hover px-3.5 py-3 text-[15px] text-foreground placeholder:text-muted-2 outline-none";

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4">
      <div className="glow-accent w-full max-w-sm">
        <form onSubmit={onSubmit} className="card w-full p-8 animate-fade-in">
          <div className="mb-8 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-accent text-base font-extrabold text-accent-ink">a</span>
            <span className="text-[22px] font-extrabold tracking-[-0.03em]">abdi&apos;s os</span>
          </div>
          <h1 className="text-[28px] mb-2">
            Sign <span className="hl">in</span>
          </h1>
          <p className="text-[15px] text-muted mb-6">Private command center.</p>

          <label htmlFor="email" className="eyebrow block mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputClass} mb-4`}
          />

          <label htmlFor="password" className="eyebrow block mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${inputClass} mb-5`}
          />

          {error && (
            <p className="text-sm text-danger mb-4" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full min-h-[52px] text-[15px]">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
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
