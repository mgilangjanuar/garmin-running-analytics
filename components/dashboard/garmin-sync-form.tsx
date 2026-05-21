"use client";

import { useCallback, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Status = "idle" | "syncing" | "success" | "error";

export function GarminSyncForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<{ step: string; current: number; total: number } | null>(null);

  const handleSync = useCallback(async () => {
    setStatus("syncing");
    setMessage("");
    setProgress(null);

    try {
      const res = await fetch("/api/garmin/sync", { method: "POST" });

      if (!res.ok || !res.body) {
        const data = await res.json() as { message?: string; details?: string };
        setStatus("error");
        setMessage(data.message ?? data.details ?? "Sync failed");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              type: string;
              ok?: boolean;
              message?: string;
              details?: string;
              step?: string;
              currentStep?: number;
              totalSteps?: number;
            };

            if (event.type === "progress") {
              setProgress({
                step: event.step ?? "",
                current: event.currentStep ?? 0,
                total: event.totalSteps ?? 1,
              });
            } else if (event.type === "done") {
              setStatus("success");
              setMessage(event.message ?? "Sync complete.");
              setProgress(null);
            } else if (event.type === "error") {
              setStatus("error");
              setMessage(event.details ?? event.message ?? "Sync failed.");
              setProgress(null);
            }
          } catch {
            // malformed line
          }
        }
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Network error");
      setProgress(null);
    }
  }, []);

  const progressPct = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync Garmin Data</CardTitle>
        <CardDescription>Fetch your latest data directly from Garmin Connect</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={handleSync} disabled={status === "syncing"}>
          {status === "syncing" ? "Syncing…" : "Sync from Garmin"}
        </Button>

        {status === "syncing" && progress && (
          <div className="space-y-1">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{progress.step}</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{progress.current} / {progress.total}</p>
          </div>
        )}

        {status === "syncing" && !progress && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Connecting to Garmin…</p>
        )}

        {message && status !== "syncing" && (
          <p className={`text-sm ${status === "success" ? "text-green-600" : "text-red-600"}`}>
            {message}
          </p>
        )}

        {status === "success" && (
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Refresh dashboard
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
