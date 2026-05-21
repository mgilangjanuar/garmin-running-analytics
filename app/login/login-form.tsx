"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push(redirectTo);
        router.refresh();
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Incorrect password.");
        setPassword("");
        inputRef.current?.focus();
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Password
          </label>
          <Input
            ref={inputRef}
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password…"
            className={error ? "border-red-300 focus-visible:ring-red-300" : ""}
          />
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
        </div>
        <Button type="submit" className="w-full" disabled={loading || !password.trim()}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </div>
    </form>
  );
}
