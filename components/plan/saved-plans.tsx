"use client";

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SavedPlanMeta } from "@/lib/plans/store"

type Props = {
  onLoad: (id: string) => void;
  activePlanId: string | null;
  refreshKey: number;
};

export function SavedPlans({ onLoad, activePlanId, refreshKey }: Props) {
  const [plans, setPlans] = useState<SavedPlanMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadMsgs, setUploadMsgs] = useState<Record<string, string>>({});

  async function fetchPlans() {
    setLoading(true);
    try {
      const res = await fetch("/api/plans");
      if (res.ok) setPlans(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchPlans();
  }, [refreshKey]);

  async function handleRename(id: string) {
    if (!renameValue.trim()) return;
    const res = await fetch(`/api/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: renameValue }),
    });
    if (res.ok) {
      setRenamingId(null);
      void fetchPlans();
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/plans/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPlans((prev) => prev.filter((p) => p.id !== id));
    }
    setDeletingId(null);
  }

  async function handleUploadToGarmin(id: string) {
    setUploadingId(id);
    setUploadMsgs((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/plans/${id}`);
      if (!res.ok) { setUploadMsgs((prev) => ({ ...prev, [id]: "Failed to load plan." })); return; }
      const saved = await res.json() as { plan: Record<string, unknown> };
      const uploadRes = await fetch("/api/garmin/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full", plan: saved.plan }),
      });
      const payload = await uploadRes.json() as Record<string, unknown>;
      if (!uploadRes.ok) {
        setUploadMsgs((prev) => ({ ...prev, [id]: (payload.error as string | undefined) ?? "Upload failed." }));
      } else {
        setUploadMsgs((prev) => ({ ...prev, [id]: `${payload.uploaded as number}/${payload.total as number} workouts uploaded to Garmin` }));
      }
    } catch {
      setUploadMsgs((prev) => ({ ...prev, [id]: "Upload failed." }));
    } finally {
      setUploadingId(null);
    }
  }

  if (loading) {
    return <p className="text-xs text-zinc-400 dark:text-zinc-500 px-1">Loading saved plans…</p>;
  }

  if (plans.length === 0) {
    return <p className="text-xs text-zinc-400 dark:text-zinc-500 px-1">No saved plans yet.</p>;
  }

  return (
    <div className="space-y-2">
      {plans.map((plan) => {
        const isActive = plan.id === activePlanId;
        const isRenaming = renamingId === plan.id;

        return (
          <div
            key={plan.id}
            className={`rounded-lg border p-3 space-y-2 transition-colors ${isActive ? "border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/20" : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/50"}`}
          >
            {isRenaming ? (
              <div className="flex gap-1.5">
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="h-7 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleRename(plan.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  autoFocus
                />
                <Button size="sm" className="h-7 text-xs px-2" onClick={() => void handleRename(plan.id)}>Save</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setRenamingId(null)}>✕</Button>
              </div>
            ) : (
              <p
                className="text-xs font-semibold leading-snug cursor-pointer hover:text-indigo-700 transition-colors"
                onClick={() => onLoad(plan.id)}
              >
                {plan.title}
              </p>
            )}

            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              {plan.totalWeeks}wk · {plan.phaseCount} phases · {plan.startDate} → {plan.endDate}
            </p>
            <p className="text-xs text-zinc-300 dark:text-zinc-600">
              Saved {new Date(plan.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>

            <div className="flex items-center gap-1 flex-wrap">
              {/* <Button
                size="sm"
                variant={isActive ? "default" : "outline"}
                className="h-6 text-xs px-2"
                onClick={() => onLoad(plan.id)}
              >
                {isActive ? "Loaded" : "Load"}
              </Button> */}
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs px-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                disabled={uploadingId === plan.id}
                onClick={() => void handleUploadToGarmin(plan.id)}
              >
                {uploadingId === plan.id ? "…" : "↑ Garmin"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs px-2"
                onClick={() => {
                  setRenamingId(plan.id);
                  setRenameValue(plan.title);
                }}
              >
                Rename
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                disabled={deletingId === plan.id}
                onClick={() => void handleDelete(plan.id)}
              >
                {deletingId === plan.id ? "…" : "Delete"}
              </Button>
            </div>
            {uploadMsgs[plan.id] ? (
              <p className={`text-xs mt-1 ${uploadMsgs[plan.id].includes("uploaded") ? "text-green-600" : "text-red-500"}`}>
                {uploadMsgs[plan.id]}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
