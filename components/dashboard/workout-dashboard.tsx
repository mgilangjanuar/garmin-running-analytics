"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDateLabel,
  formatDistanceKm,
  formatDurationHours,
  formatMinutes,
  formatNumber,
  formatSport,
} from "@/lib/garmin/format";
import type { WorkoutAnalytics } from "@/lib/garmin/types";

type WorkoutDashboardProps = {
  analytics: WorkoutAnalytics;
  isLoggedIn?: boolean;
};

function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return {
    isDark,
    grid: isDark ? "#3f3f46" : "#d4d4d8",
    axis: isDark ? "#71717a" : "#71717a",
    tooltip: {
      contentStyle: {
        background: isDark ? "#18181b" : "#ffffff",
        border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
        borderRadius: "8px",
        color: isDark ? "#f4f4f5" : "#18181b",
        fontSize: "12px",
      },
      labelStyle: { color: isDark ? "#a1a1aa" : "#52525b" },
    },
    legend: { color: isDark ? "#a1a1aa" : "#52525b" },
  };
}

export function WorkoutDashboard({ analytics, isLoggedIn = false }: WorkoutDashboardProps) {
  const latestReadiness = analytics.trends.readiness.at(-1);
  const latestVo2 = analytics.trends.vo2Max.at(-1);
  const latestSleep = analytics.trends.sleep.at(-1);
  const latestAcute = analytics.trends.acuteLoad.at(-1);
  const latestRace = analytics.trends.racePrediction.at(-1);
  const chart = useChartTheme();

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total Sessions"
          value={formatNumber(analytics.totals.activities, 0)}
          subtitle={`${analytics.period.start} → ${analytics.period.end}`}
        />
        <StatCard
          title="Total Distance"
          value={formatDistanceKm(analytics.totals.distanceKm)}
          subtitle={`${formatDistanceKm(analytics.totals.averageDistancePerActivityKm)} / activity`}
        />
        <StatCard
          title="Total Duration"
          value={formatDurationHours(analytics.totals.durationHours)}
          subtitle={`${formatNumber(analytics.period.totalDays, 0)} days tracked`}
        />
        <StatCard
          title="Current Readiness"
          value={latestReadiness ? `${latestReadiness.score}/100` : "N/A"}
          subtitle={latestReadiness?.level ?? "No readiness record"}
        />
        <StatCard
          title="Current VO2 Max"
          value={latestVo2 ? `${formatNumber(latestVo2.vo2Max, 1)}` : "N/A"}
          subtitle="Running fitness capacity"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader>
            <CardTitle>Personal Insights</CardTitle>
            <CardDescription>Automatically generated from your full history</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            {analytics.insights.map((insight) => (
              <p key={insight} className="rounded-lg bg-zinc-100/80 p-3 dark:bg-zinc-800">
                {insight}
              </p>
            ))}
          </CardContent>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader>
            <CardTitle>Current Signals</CardTitle>
            <CardDescription>Latest watch-based readiness and prediction data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SignalRow label="Readiness" value={latestReadiness ? `${latestReadiness.score} (${latestReadiness.level})` : "N/A"} />
            <SignalRow
              label="Sleep"
              value={latestSleep ? `${latestSleep.score}/100 · ${formatDurationHours(latestSleep.durationHours)}` : "N/A"}
            />
            <SignalRow
              label="ACWR"
              value={latestAcute ? `${formatNumber(latestAcute.ratio, 2)} (${latestAcute.status})` : "N/A"}
            />
            <SignalRow label="VO2 Max" value={latestVo2 ? `${formatNumber(latestVo2.vo2Max, 1)}` : "N/A"} />
            <SignalRow
              label="Predicted 5K"
              value={latestRace ? formatMinutes(latestRace.raceTime5KMin) : "N/A"}
            />
            <SignalRow
              label="Predicted 10K"
              value={latestRace ? formatMinutes(latestRace.raceTime10KMin) : "N/A"}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader>
            <CardTitle>Weekly Training Volume</CardTitle>
            <CardDescription>Distance, duration, and load by week</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.trends.weeklyVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={false} stroke={chart.axis} />
                <YAxis yAxisId="left" tick={false} width={0} stroke={chart.axis} />
                <YAxis yAxisId="right" orientation="right" tick={false} width={0} stroke={chart.axis} />
                <Tooltip
                  contentStyle={chart.tooltip.contentStyle}
                  labelStyle={chart.tooltip.labelStyle}
                  labelFormatter={(value) =>
                    typeof value === "string" ? formatDateLabel(value) : value
                  }
                  formatter={(value, name) => {
                    if (name === "distanceKm") return [`${formatNumber(Number(value), 2)} km`, "Distance"];
                    if (name === "durationHours") return [`${formatNumber(Number(value), 2)} h`, "Duration"];
                    if (name === "trainingLoad") return [`${formatNumber(Number(value), 0)}`, "Load"];
                    return [value, name];
                  }}
                />
                <Bar yAxisId="left" dataKey="trainingLoad" fill="#6366f1" radius={[6, 6, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="distanceKm"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="durationHours"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="xl:col-span-4">
          <CardHeader>
            <CardTitle>Personal Records</CardTitle>
            <CardDescription>Current best efforts recorded on Garmin Connect</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {analytics.personalRecords.filter((pr) => pr.isCurrent).length > 0 ? (
              analytics.personalRecords
                .filter((pr) => pr.isCurrent && isNaN(Number(pr.type)))
                .map((pr) => (
                  <div
                    key={pr.type}
                    className="flex items-center justify-between rounded-lg bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800"
                  >
                    <span className="text-zinc-600 dark:text-zinc-400">{pr.type}</span>
                    <span className="font-medium tabular-nums">{formatPrValue(pr.unit, pr.value)}</span>
                  </div>
                ))
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No personal records found.</p>
            )}
          </CardContent>
        </Card>

        {analytics.trends.acuteLoad.length > 0 && (
          <Card className="xl:col-span-6">
            <CardHeader>
              <CardTitle>Load Balance (ACWR)</CardTitle>
              <CardDescription>Acute/chronic workload ratio and status</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.trends.acuteLoad}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                  <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={false} stroke={chart.axis} />
                  <YAxis tick={false} width={0} stroke={chart.axis} />
                  <Tooltip
                    contentStyle={chart.tooltip.contentStyle}
                    labelStyle={chart.tooltip.labelStyle}
                    labelFormatter={(value) =>
                      typeof value === "string" ? formatDateLabel(value) : value
                    }
                  />
                  <Legend wrapperStyle={{ color: chart.legend.color }} />
                  <Line type="monotone" dataKey="ratio" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line
                    type="monotone"
                    dataKey="acwrPercent"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader>
            <CardTitle>Recovery Snapshot</CardTitle>
            <CardDescription>Readiness and sleep quality trend</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mergeReadinessAndSleep(analytics)}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={false} stroke={chart.axis} />
                <YAxis tick={false} width={0} stroke={chart.axis} />
                <Tooltip
                  contentStyle={chart.tooltip.contentStyle}
                  labelStyle={chart.tooltip.labelStyle}
                  labelFormatter={(value) =>
                    typeof value === "string" ? formatDateLabel(value) : value
                  }
                  formatter={(value, name) => {
                    if (name === "readinessScore") return [`${formatNumber(Number(value), 0)} / 100`, "Readiness"];
                    if (name === "sleepScore") return [`${formatNumber(Number(value), 0)} / 100`, "Sleep"];
                    return [value, name];
                  }}
                />
                <Legend wrapperStyle={{ color: chart.legend.color }} />
                <Area
                  type="monotone"
                  dataKey="readinessScore"
                  fill="#10b981"
                  stroke="#10b981"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="sleepScore"
                  fill="#3b82f6"
                  stroke="#3b82f6"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="xl:col-span-4">
          <CardHeader>
            <CardTitle>Sport Mix</CardTitle>
            <CardDescription>How your sessions are distributed</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.sportDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="sport" tickFormatter={formatSport} tick={{ fontSize: 10, fill: chart.axis }} stroke={chart.axis} />
                <YAxis tick={false} width={0} stroke={chart.axis} />
                <Tooltip
                  contentStyle={chart.tooltip.contentStyle}
                  labelStyle={chart.tooltip.labelStyle}
                />
                <Bar dataKey="activities" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>VO2 Max Trend</CardTitle>
            <CardDescription>
              {latestVo2 ? `Current: ${formatNumber(latestVo2.vo2Max, 1)} mL/kg/min` : "Running fitness capacity"}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.trends.vo2Max}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={false} stroke={chart.axis} />
                <YAxis domain={["auto", "auto"]} tick={false} width={0} stroke={chart.axis} />
                <Tooltip
                  contentStyle={chart.tooltip.contentStyle}
                  labelStyle={chart.tooltip.labelStyle}
                  labelFormatter={(value) =>
                    typeof value === "string" ? formatDateLabel(value) : value
                  }
                />
                <Line type="monotone" dataKey="vo2Max" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Race Predictor</CardTitle>
            <CardDescription>
              {latestRace ? `As of ${formatDateLabel(latestRace.date)}` : "Predicted finish times from Garmin"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestRace ? (
              <>
                <RacePredRow label="5K" minutes={latestRace.raceTime5KMin} color="#6366f1" />
                <RacePredRow label="10K" minutes={latestRace.raceTime10KMin} color="#0ea5e9" />
                <RacePredRow label="Half" minutes={latestRace.raceTimeHalfMin} color="#f59e0b" />
                <RacePredRow label="Marathon" minutes={latestRace.raceTimeMarathonMin} color="#ef4444" />
              </>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No race prediction data. Sync Garmin data first.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Heart-Rate Zones</CardTitle>
            <CardDescription>
              {analytics.zones.heartRate
                ? `Method: ${analytics.zones.heartRate.method ?? "Unknown"} · Max HR ${analytics.zones.heartRate.maxHrUsed ?? "–"}`
                : "No zone data available"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.zones.heartRate ? (
              <HrZonesBars zones={analytics.zones.heartRate} />
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Sync Garmin data to populate HR zones.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {isLoggedIn ? (
          <Card>
            <CardHeader>
              <CardTitle>Latest Activities</CardTitle>
              <CardDescription>Recent workouts and training load</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {analytics.activities.latest.slice(0, 8).map((activity) => (
                <Link
                  key={`${activity.id}-${activity.startTime}`}
                  href={`/activity/${activity.id}`}
                  className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:hover:bg-zinc-800/50 hover:bg-zinc-50/80 transition-colors"
                >
                  <div>
                    <p className="font-medium">{activity.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatDateLabel(activity.startTime)} · {formatSport(activity.sport)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <Badge variant="secondary">{formatDistanceKm(activity.distanceKm)}</Badge>
                    <Badge variant="secondary">{formatDurationHours(activity.durationHours)}</Badge>
                    {activity.trainingLoad !== null ? (
                      <Badge variant="outline">Load {formatNumber(activity.trainingLoad, 0)}</Badge>
                    ) : null}
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        ) : (
          <></>
        )}
      </section>
    </div>
  );
}

function mergeReadinessAndSleep(analytics: WorkoutAnalytics) {
  const map = new Map<
    string,
    { date: string; readinessScore: number | null; sleepScore: number | null }
  >();

  for (const readiness of analytics.trends.readiness) {
    map.set(readiness.date, {
      date: readiness.date,
      readinessScore: readiness.score,
      sleepScore: map.get(readiness.date)?.sleepScore ?? null,
    });
  }

  for (const sleep of analytics.trends.sleep) {
    map.set(sleep.date, {
      date: sleep.date,
      readinessScore: map.get(sleep.date)?.readinessScore ?? null,
      sleepScore: sleep.score,
    });
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      </CardHeader>
    </Card>
  );
}

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-zinc-100/80 px-3 py-2 dark:bg-zinc-800">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

const HR_ZONE_COLORS = ["#22c55e", "#84cc16", "#f59e0b", "#f97316", "#ef4444"];
const HR_ZONE_LABELS = ["Z1 Recovery", "Z2 Aerobic", "Z3 Tempo", "Z4 Threshold", "Z5 Max"];

function HrZonesBars({
  zones,
}: {
  zones: NonNullable<WorkoutAnalytics["zones"]["heartRate"]>;
}) {
  const z1 = zones.zone1Floor ?? 0;
  const z2 = zones.zone2Floor ?? 0;
  const z3 = zones.zone3Floor ?? 0;
  const z4 = zones.zone4Floor ?? 0;
  const z5 = zones.zone5Floor ?? 0;
  const maxHr = zones.maxHrUsed ?? 220;

  const rangeMin = z1;
  const rangeMax = maxHr;
  const span = rangeMax - rangeMin || 1;

  const zoneRanges = HR_ZONE_LABELS.map((label, i) => {
    const lows = [z1, z2, z3, z4, z5];
    const highs = [z2, z3, z4, z5, maxHr];
    const low = lows[i];
    const high = highs[i];
    const leftPct = ((low - rangeMin) / span) * 100;
    const widthPct = ((high - low) / span) * 100;
    return { label, low, high, leftPct, widthPct, color: HR_ZONE_COLORS[i] };
  });

  return (
    <div className="space-y-4">
      <div className="relative h-6 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        {zoneRanges.map((z) => (
          <div
            key={z.label}
            className="absolute top-0 h-full"
            style={{ left: `${z.leftPct}%`, width: `${z.widthPct}%`, backgroundColor: z.color }}
            title={`${z.label}: ${z.low}–${z.high} bpm`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-zinc-400 dark:text-zinc-500 -mt-2">
        <span>{rangeMin} bpm</span>
        <span>{rangeMax} bpm</span>
      </div>
      <div className="space-y-2">
        {zoneRanges.map((z) => (
          <div key={z.label} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: z.color }} />
              <span className="text-zinc-600 dark:text-zinc-400">{z.label}</span>
            </div>
            <span className="font-medium tabular-nums">
              {z.low > 0 ? `${z.low}–${z.high} bpm` : "–"}
            </span>
          </div>
        ))}
        <div className="mt-3 flex justify-between border-t border-zinc-200 pt-3 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          <span>Resting HR: {zones.restingHrUsed ?? "–"} bpm</span>
          <span>Max HR: {zones.maxHrUsed ?? "–"} bpm</span>
        </div>
      </div>
    </div>
  );
}

function RacePredRow({ label, minutes, color }: { label: string; minutes: number; color: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-zinc-100/80 px-3 py-2 text-sm dark:bg-zinc-800">
      <div className="flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      </div>
      <span className="font-medium tabular-nums">{minutes > 0 ? formatMinutes(minutes) : "–"}</span>
    </div>
  );
}

function formatPrValue(unit: "time_s" | "distance_m" | "count", value: number): string {
  if (unit === "time_s") {
    const totalSec = Math.round(value);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  if (unit === "distance_m") {
    return `${(value / 1000).toFixed(2)} km`;
  }
  return String(Math.round(value));
}
