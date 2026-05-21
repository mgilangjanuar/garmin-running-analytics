"use client";

import { useEffect, useState } from "react";

import type { LongTermPlan, TrainingPhase, WorkoutDefinition } from "@/lib/garmin/fit-encoder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type PlanAssistantProps = {
  contextSummary: {
    currentReadiness: string;
    currentVo2: string;
    totalSessions: number;
    totalDistanceKm: number;
  };
  onPlanSaved?: () => void;
  loadPlanId?: string | null;
  onLoaded?: (id: string) => void;
};

const INTENSITY_COLOR: Record<string, string> = {
  warmup: "bg-yellow-400",
  cooldown: "bg-blue-300",
  interval: "bg-red-400",
  recovery: "bg-green-400",
  rest: "bg-zinc-200",
  active: "bg-indigo-400",
};

function formatDuration(durationType: string, durationValue: number): string | null {
  if (durationType === "open") return "Until lap press";
  if (durationType === "time") {
    const totalSec = durationValue;
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}min`;
    if (m > 0 && s > 0) return `${m}min ${s}s`;
    if (m > 0) return `${m}min`;
    return `${s}s`;
  }
  if (durationType === "distance") {
    if (durationValue >= 1000) return `${(durationValue / 1000).toFixed(1)} km`;
    return `${durationValue} m`;
  }
  return null;
}

function formatTarget(targetType?: string, targetLow?: number, targetHigh?: number): string | null {
  if (!targetType || targetType === "open") return null;
  if (targetType === "heartRate") {
    if (targetLow !== undefined && targetHigh !== undefined) return `HR ${targetLow}–${targetHigh} bpm`;
    if (targetLow !== undefined) return `HR >${targetLow} bpm`;
    if (targetHigh !== undefined) return `HR <${targetHigh} bpm`;
  }
  if (targetType === "power") {
    if (targetLow !== undefined && targetHigh !== undefined) return `${targetLow}–${targetHigh} W`;
    if (targetLow !== undefined) return `>${targetLow} W`;
  }
  if (targetType === "cadence") {
    if (targetLow !== undefined && targetHigh !== undefined) return `${targetLow}–${targetHigh} spm`;
  }
  if (targetType === "speed") {
    if (targetLow !== undefined && targetHigh !== undefined) return `${targetLow}–${targetHigh} m/s`;
  }
  return null;
}

function StepRow({ name, notes, intensity, durationType, durationValue, targetType, targetLow, targetHigh }: {
  name: string;
  notes?: string;
  intensity: string;
  durationType: string;
  durationValue: number;
  targetType?: string;
  targetLow?: number;
  targetHigh?: number;
}) {
  const duration = formatDuration(durationType, durationValue);
  const target = formatTarget(targetType, targetLow, targetHigh);
  return (
    <div className="flex items-start gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 py-0.5">
      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${INTENSITY_COLOR[intensity] ?? "bg-zinc-300"}`} />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{name}</span>
        {duration ? <span className="text-zinc-400 dark:text-zinc-500 ml-1.5">{duration}</span> : null}
        {target ? (
          <span className="ml-1.5 text-xs bg-zinc-100 text-zinc-600 px-1 rounded dark:bg-zinc-800 dark:text-zinc-400">{target}</span>
        ) : null}
        {notes ? <span className="block text-zinc-400 dark:text-zinc-500 leading-snug mt-0.5">{notes}</span> : null}
      </div>
    </div>
  );
}

async function uploadToGarmin(
  body: Record<string, unknown>,
  onError: (msg: string) => void,
): Promise<{ uploaded: number; total: number } | null> {
  const response = await fetch("/api/garmin/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    onError((payload.error as string | undefined) ?? "Upload failed.");
    return null;
  }
  return { uploaded: payload.uploaded as number, total: payload.total as number };
}



function calcWorkoutTotals(workout: WorkoutDefinition): { totalTimeSec: number; totalDistanceM: number } {
  let totalTimeSec = 0;
  let totalDistanceM = 0;
  for (const item of workout.items) {
    const steps = "repeatCount" in item ? item.steps.flatMap((s) => Array(item.repeatCount).fill(s)) : [item];
    for (const step of steps) {
      if (step.durationType === "time") totalTimeSec += step.durationValue;
      if (step.durationType === "distance") totalDistanceM += step.durationValue;
    }
  }
  return { totalTimeSec, totalDistanceM };
}

function WorkoutRow({ workout }: { workout: WorkoutDefinition }) {
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [err, setErr] = useState("");

  const { totalTimeSec, totalDistanceM } = calcWorkoutTotals(workout);
  const timeFmt = totalTimeSec > 0 ? formatDuration("time", totalTimeSec) : null;
  const distFmt = totalDistanceM > 0 ? formatDuration("distance", totalDistanceM) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs font-semibold">{workout.name}</span>
            {workout.description ? (
              <span className="text-xs text-zinc-500">{workout.description}</span>
            ) : null}
          </div>
          {(timeFmt ?? distFmt) ? (
            <p className="text-xs text-zinc-400 mt-0.5">
              {[timeFmt, distFmt].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-6 px-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
            disabled={uploading}
            onClick={async () => {
              setUploading(true);
              setErr("");
              setUploadMsg("");
              const res = await uploadToGarmin({ mode: "single", workout }, setErr);
              if (res) setUploadMsg(`Uploaded to Garmin`);
              setUploading(false);
            }}
          >
            {uploading ? "…" : "↑ Garmin"}
          </Button>
        </div>
      </div>
      {err ? <p className="text-xs text-red-500">{err}</p> : null}
      {uploadMsg ? <p className="text-xs text-green-600">{uploadMsg}</p> : null}
      <div className="space-y-0 pl-1 border-l border-zinc-100 dark:border-zinc-800">
        {workout.items.map((item, i) => {
          if ("repeatCount" in item) {
            const repeatTimeSec = item.steps.reduce((n, s) => n + (s.durationType === "time" ? s.durationValue : 0), 0);
            const repeatDistM = item.steps.reduce((n, s) => n + (s.durationType === "distance" ? s.durationValue : 0), 0);
            const totalRepeatTime = repeatTimeSec * item.repeatCount;
            const totalRepeatDist = repeatDistM * item.repeatCount;
            return (
              <div key={i} className="pl-2 py-1 border-l-2 border-indigo-200 dark:border-indigo-800 ml-1 space-y-0">
                <div className="flex items-baseline gap-1.5">
                  <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">× {item.repeatCount} repeats</p>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {[
                      totalRepeatTime > 0 ? formatDuration("time", totalRepeatTime) : null,
                      totalRepeatDist > 0 ? formatDuration("distance", totalRepeatDist) : null,
                    ].filter(Boolean).join(" · ")}
                  </span>
                </div>
                {item.steps.map((s, j) => (
                  <StepRow key={j} {...s} />
                ))}
              </div>
            );
          }
          return <StepRow key={i} {...item} />;
        })}
      </div>
    </div>
  );
}

function PhaseCard({ phase, open, onToggle }: { phase: TrainingPhase; open: boolean; onToggle: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [err, setErr] = useState("");

  return (
    <div className="rounded-lg border border-zinc-200 overflow-hidden dark:border-zinc-800">
      <button
        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50 transition-colors dark:hover:bg-zinc-800/50"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{phase.phase}</span>
            {phase.race ? (
              <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                🏁 {phase.race}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Wk {phase.startWeek}–{phase.endWeek} · {phase.startDate} → {phase.endDate} · {phase.weeks} week{phase.weeks !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">{phase.keyFocus}</p>
        </div>
        <span className="text-zinc-400 dark:text-zinc-500 text-sm mt-0.5 shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className="border-t border-zinc-200 px-4 py-3 space-y-3 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-800/30">
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{phase.goal}</p>
            <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Week template ({phase.weekTemplate.length} sessions)</p>
            <div className="flex items-center gap-2 flex-wrap">
              {err ? <p className="text-xs text-red-500">{err}</p> : null}
              {uploadMsg ? <p className="text-xs text-green-600">{uploadMsg}</p> : null}
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                disabled={uploading}
                onClick={async () => {
                  setUploading(true);
                  setErr("");
                  setUploadMsg("");
                  const res = await uploadToGarmin({ mode: "phase", phase }, setErr);
                  if (res) setUploadMsg(`${res.uploaded}/${res.total} workouts uploaded to Garmin`);
                  setUploading(false);
                }}
              >
                {uploading ? "Uploading…" : "↑ Upload phase to Garmin"}
              </Button>
            </div>
          </div>
          <div className="space-y-4">
            {phase.weekTemplate.map((workout, i) => (
              <WorkoutRow key={i} workout={workout} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}



export function PlanAssistant({ contextSummary, onPlanSaved, loadPlanId, onLoaded }: PlanAssistantProps) {
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<LongTermPlan | null>(null);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAll, setIsUploadingAll] = useState(false);
  const [uploadAllMsg, setUploadAllMsg] = useState("");
  const [uploadAllError, setUploadAllError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [openPhases, setOpenPhases] = useState<Set<number>>(new Set([0]));
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    if (!loadPlanId) return;
    void (async () => {
      setError("");
      setIsLoading(true);
      try {
        const res = await fetch(`/api/plans/${loadPlanId}`);
        if (!res.ok) { setError("Failed to load plan."); return; }
        const saved = await res.json();
        setPlan(saved.plan);
        setPrompt(saved.prompt ?? "");
        setActiveSavedId(loadPlanId);
        setOpenPhases(new Set([0]));
        onLoaded?.(loadPlanId);
      } catch {
        setError("Failed to load plan.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadPlanId]);

  function togglePhase(i: number) {
    setOpenPhases((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  async function handleSubmit() {
    setError("");
    setPlan(null);
    setActiveSavedId(null);
    setShowSaveForm(false);
    setOpenPhases(new Set([0]));
    setIsLoading(true);
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const payload = await response.json();
      if (!response.ok) { setError(payload.error ?? "Failed to generate plan."); return; }
      setPlan(payload as LongTermPlan);
      setSaveTitle((payload as LongTermPlan).summary.slice(0, 60));
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (!plan) return;
    setIsSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, prompt, title: saveTitle }),
      });
      if (!res.ok) {
        const payload = await res.json();
        setSaveError(payload.error ?? "Failed to save.");
        return;
      }
      const saved = await res.json();
      setActiveSavedId(saved.id);
      setShowSaveForm(false);
      onPlanSaved?.();
    } catch {
      setSaveError("Failed to save plan.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!isMounted) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>AI Training Planner</CardTitle>
          <CardDescription>
            Describe your race schedule and goals to get a full periodized long-term plan. Upload directly to Garmin with one click.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <label htmlFor="prompt" className="text-sm font-medium">Prompt</label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Example: Create a long-term plan from now through Dec 2026 targeting these races: 10K on Jun 13, HM on Jul 12, HM on Sep 20, HM on Oct 24. I run Mon, Tue, Thu, Sat. Improve my avg HR from 181 and run without walking."
              className="min-h-40"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-100/80 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
            <span>
              Context: {contextSummary.totalSessions} sessions ·{" "}
              {contextSummary.totalDistanceKm.toFixed(1)} km · readiness {contextSummary.currentReadiness}
            </span>
            <span>VO2 max {contextSummary.currentVo2}</span>
          </div>
          <div>
            <Button onClick={handleSubmit} disabled={isLoading || !prompt.trim()}>
              {isLoading ? "Generating long-term plan…" : "Generate long-term plan"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-red-300">
          <CardContent className="pt-6 text-sm text-red-600">{error}</CardContent>
        </Card>
      ) : null}

      {plan ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span>{plan.totalWeeks}-week training plan</span>
                <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
                  {plan.startDate} → {plan.endDate}
                </span>
                {activeSavedId ? (
                  <span className="text-xs font-normal text-green-600 bg-green-50 px-1.5 py-0.5 rounded dark:text-green-400 dark:bg-green-900/30">
                    Saved
                  </span>
                ) : null}
              </CardTitle>
              <CardDescription>
                {plan.phases.length} phases · {plan.phases.filter((p) => p.race).length} race week{plan.phases.filter((p) => p.race).length !== 1 ? "s" : ""} · expand each phase to view sessions
              </CardDescription>
            </div>
            <div className="flex flex-col items-start gap-1.5 sm:items-end sm:shrink-0">
              <div className="flex flex-wrap gap-1.5">
                {!activeSavedId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSaveForm((v) => !v)}
                  >
                    {showSaveForm ? "Cancel" : "Save plan"}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                  disabled={isUploadingAll}
                  onClick={async () => {
                    setIsUploadingAll(true);
                    setUploadAllMsg("");
                    setUploadAllError("");
                    const res = await uploadToGarmin({ mode: "full", plan }, setUploadAllError);
                    if (res) setUploadAllMsg(`${res.uploaded}/${res.total} workouts uploaded to Garmin`);
                    setIsUploadingAll(false);
                  }}
                >
                  {isUploadingAll ? "Uploading…" : "↑ Upload all to Garmin"}
                </Button>
              </div>
              {uploadAllError ? <p className="text-xs text-red-500">{uploadAllError}</p> : null}
              {uploadAllMsg ? <p className="text-xs text-green-600">{uploadAllMsg}</p> : null}
            </div>
          </CardHeader>

          {showSaveForm ? (
            <div className="px-6 pb-3">
              <div className="flex gap-2 items-center">
                <Input
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder="Plan title…"
                  className="h-8 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
                />
                <Button size="sm" className="h-8" disabled={isSaving || !saveTitle.trim()} onClick={handleSave}>
                  {isSaving ? "Saving…" : "Save"}
                </Button>
              </div>
              {saveError ? <p className="text-xs text-red-500 mt-1">{saveError}</p> : null}
            </div>
          ) : null}

          <CardContent className="space-y-3">
            {plan.summary ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed border-l-4 border-indigo-200 dark:border-indigo-800 pl-3">
                {plan.summary}
              </p>
            ) : null}
            <div className="space-y-2">
              {plan.phases.map((phase, i) => (
                <PhaseCard key={i} phase={phase} open={openPhases.has(i)} onToggle={() => togglePhase(i)} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
