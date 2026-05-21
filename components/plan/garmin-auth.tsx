"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const LS_CSRF = "garmin_csrf_token";
const LS_COOKIES = "garmin_cookies";

export interface GarminCredentials {
  csrfToken: string;
  cookies: string;
}

export function useGarminCredentials(): {
  credentials: GarminCredentials | null;
  isReady: boolean;
} {
  const [credentials, setCredentials] = useState<GarminCredentials | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const csrfToken = localStorage.getItem(LS_CSRF) ?? "";
    const cookies = localStorage.getItem(LS_COOKIES) ?? "";
    if (csrfToken && cookies) {
      setCredentials({ csrfToken, cookies });
    }
    setIsReady(true);
  }, []);

  return { credentials, isReady };
}

type Props = {
  onSaved?: (creds: GarminCredentials) => void;
};

export function GarminAuthPanel({ onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");
  const [cookies, setCookies] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasCreds, setHasCreds] = useState(false);

  useEffect(() => {
    const storedCsrf = localStorage.getItem(LS_CSRF) ?? "";
    const storedCookies = localStorage.getItem(LS_COOKIES) ?? "";
    if (storedCsrf) setCsrfToken(storedCsrf);
    if (storedCookies) setCookies(storedCookies);
    setHasCreds(Boolean(storedCsrf && storedCookies));
  }, []);

  function handleSave() {
    if (!csrfToken.trim() || !cookies.trim()) return;
    localStorage.setItem(LS_CSRF, csrfToken.trim());
    localStorage.setItem(LS_COOKIES, cookies.trim());
    setHasCreds(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved?.({ csrfToken: csrfToken.trim(), cookies: cookies.trim() });
  }

  function handleClear() {
    localStorage.removeItem(LS_CSRF);
    localStorage.removeItem(LS_COOKIES);
    setCsrfToken("");
    setCookies("");
    setHasCreds(false);
  }

  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden text-xs">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-zinc-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-700">Garmin Connect session</span>
          {hasCreds ? (
            <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded font-medium">Connected</span>
          ) : (
            <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">Not set</span>
          )}
        </div>
        <span className="text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className="border-t border-zinc-100 px-3 pb-3 pt-2 space-y-3 bg-zinc-50/50">
          <div className="space-y-1">
            <p className="text-zinc-600 leading-relaxed">
              To upload workouts directly to Garmin Connect, paste your browser session credentials below.
              They are stored only in your browser&apos;s local storage and never sent anywhere except directly to Garmin.
            </p>
            <details className="mt-1">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-700 font-medium">How to get these values</summary>
              <ol className="list-decimal list-inside space-y-1 text-zinc-600 pl-1 mt-1.5">
                <li>Open <strong>connect.garmin.com</strong> and log in</li>
                <li>Open DevTools → Network tab → filter by <code className="bg-zinc-200 px-1 rounded">workout-service</code></li>
                <li>Click any workout or navigate to Training → Workouts to trigger a request</li>
                <li>Click on that request → Headers</li>
                <li>Copy the value of <code className="bg-zinc-200 px-1 rounded">connect-csrf-token</code> header</li>
                <li>Copy the full value of the <code className="bg-zinc-200 px-1 rounded">cookie</code> request header</li>
              </ol>
            </details>
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-zinc-700">CSRF Token</label>
            <Input
              value={csrfToken}
              onChange={(e) => setCsrfToken(e.target.value)}
              placeholder="e.g. aa4a999e-711d-480d-b02c-c3bef1b26650"
              className="h-7 text-xs font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-zinc-700">Cookies</label>
            <Textarea
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
              placeholder="Paste the full cookie string from the request headers…"
              className="text-xs font-mono min-h-20 resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!csrfToken.trim() || !cookies.trim()}
              onClick={handleSave}
            >
              {saved ? "Saved!" : "Save credentials"}
            </Button>
            {hasCreds ? (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={handleClear}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
