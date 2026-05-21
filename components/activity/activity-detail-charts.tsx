"use client";

import { useTheme } from "next-themes";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration, formatPace } from "@/lib/garmin/format";
import type { ActivitySplitPoint, NormalizedActivity } from "@/lib/garmin/types";

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
    tick: { fontSize: 10, fill: isDark ? "#71717a" : "#52525b" },
    tickMd: { fontSize: 11, fill: isDark ? "#71717a" : "#52525b" },
  };
}

export function ActivityDetailCharts({
  splits,
  activity,
}: {
  splits: ActivitySplitPoint[];
  activity: NormalizedActivity;
}) {
  const chart = useChartTheme();
  const hasSplits = splits.length > 0;

  const chartData = splits.map((split) => ({
    split: split.index,
    durationMin: split.durationSec / 60,
    elapsedMin: split.elapsedSec / 60,
    distanceKm: split.distanceKm,
    cumulativeDistanceKm: split.cumulativeDistanceKm,
    paceMinPerKm: split.paceMinPerKm,
    avgHr: split.avgHr,
    avgPower: split.avgPower,
  }));

  if (!hasSplits) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Activity Splits</CardTitle>
          <CardDescription>
            No per-split records available for this activity. Showing overall pace summary below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm">
            <SummaryItem label="Avg Pace" value={formatPace(activity.paceMinPerKm)} />
            <SummaryItem
              label="Total Time"
              value={formatDuration(activity.durationHours)}
            />
            {activity.paceMinPerKm && activity.distanceKm > 0 && (
              <SummaryItem
                label="Est. 5 km split"
                value={formatPace(activity.paceMinPerKm)}
              />
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const avgPaceOverall = activity.paceMinPerKm;

  return (
    <section className="flex flex-col gap-4">
      <SplitsTable splits={splits} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pace by Split</CardTitle>
            <CardDescription>Min/km per km split</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis
                  dataKey="split"
                  label={{ value: "Split", position: "insideBottomRight", offset: -4, fill: chart.axis }}
                  tick={chart.tickMd}
                  stroke={chart.axis}
                />
                <YAxis
                  tickFormatter={(v) => formatPace(v)}
                  tick={chart.tick}
                  width={60}
                  reversed
                  stroke={chart.axis}
                />
                <Tooltip
                  contentStyle={chart.tooltip.contentStyle}
                  labelStyle={chart.tooltip.labelStyle}
                  labelFormatter={(v) => `Split ${v}`}
                  formatter={(value, name) => {
                    if (name === "Pace" && typeof value === "number") return [formatPace(value), "Pace"];
                    return [value, name];
                  }}
                />
                {avgPaceOverall && (
                  <ReferenceLine
                    y={avgPaceOverall}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    label={{ value: "Avg", position: "right", fontSize: 10, fill: "#94a3b8" }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="paceMinPerKm"
                  name="Pace"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Heart Rate by Split</CardTitle>
            <CardDescription>Avg bpm per split</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis
                  dataKey="split"
                  label={{ value: "Split", position: "insideBottomRight", offset: -4, fill: chart.axis }}
                  tick={chart.tickMd}
                  stroke={chart.axis}
                />
                <YAxis tick={chart.tick} width={40} stroke={chart.axis} />
                <Tooltip
                  contentStyle={chart.tooltip.contentStyle}
                  labelStyle={chart.tooltip.labelStyle}
                  labelFormatter={(v) => `Split ${v}`}
                  formatter={(value, name) => [`${value} bpm`, name]}
                />
                <Legend wrapperStyle={{ color: chart.legend.color }} />
                <Line
                  type="monotone"
                  dataKey="avgHr"
                  name="Avg HR"
                  stroke="#dc2626"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {chartData.some((d) => d.avgPower !== null) && (
          <Card>
            <CardHeader>
              <CardTitle>Power by Split</CardTitle>
              <CardDescription>Avg watts per split</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                  <XAxis
                    dataKey="split"
                    label={{ value: "Split", position: "insideBottomRight", offset: -4, fill: chart.axis }}
                    tick={chart.tickMd}
                    stroke={chart.axis}
                  />
                  <YAxis tick={chart.tick} width={40} stroke={chart.axis} />
                  <Tooltip
                    contentStyle={chart.tooltip.contentStyle}
                    labelStyle={chart.tooltip.labelStyle}
                    labelFormatter={(v) => `Split ${v}`}
                    formatter={(value, name) => [`${value} W`, name]}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgPower"
                    name="Avg Power"
                    stroke="#0f766e"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Cumulative Distance</CardTitle>
            <CardDescription>km covered over elapsed time</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis
                  dataKey="elapsedMin"
                  tickFormatter={(v) => `${Math.round(v)}m`}
                  tick={chart.tick}
                  label={{ value: "Elapsed (min)", position: "insideBottomRight", offset: -4, fill: chart.axis }}
                  stroke={chart.axis}
                />
                <YAxis
                  tickFormatter={(v) => `${v} km`}
                  tick={chart.tick}
                  width={52}
                  stroke={chart.axis}
                />
                <Tooltip
                  contentStyle={chart.tooltip.contentStyle}
                  labelStyle={chart.tooltip.labelStyle}
                  labelFormatter={(v) =>
                    typeof v === "number" ? formatDuration(v / 60) : v
                  }
                  formatter={(value) => [`${value} km`, "Distance"]}
                />
                <Line
                  type="monotone"
                  dataKey="cumulativeDistanceKm"
                  name="Distance"
                  stroke="#9333ea"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function SplitsTable({ splits }: { splits: ActivitySplitPoint[] }) {
  const hasHr = splits.some((s) => s.avgHr !== null);
  const hasPower = splits.some((s) => s.avgPower !== null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Split Details</CardTitle>
        <CardDescription>Per-km breakdown</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="pb-2 pr-4 font-medium">#</th>
              <th className="pb-2 pr-4 font-medium">Distance</th>
              <th className="pb-2 pr-4 font-medium">Pace</th>
              <th className="pb-2 pr-4 font-medium">Split Time</th>
              <th className="pb-2 pr-4 font-medium">Elapsed</th>
              {hasHr && <th className="pb-2 pr-4 font-medium">Avg HR</th>}
              {hasPower && <th className="pb-2 font-medium">Avg Power</th>}
            </tr>
          </thead>
          <tbody>
            {splits.map((split) => (
              <tr
                key={split.index}
                className="border-b border-zinc-100 last:border-0 hover:bg-zinc-100/60 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
              >
                <td className="py-2 pr-4 text-zinc-400 dark:text-zinc-500">{split.index}</td>
                <td className="py-2 pr-4 font-medium tabular-nums">
                  {split.distanceKm.toFixed(2)} km
                </td>
                <td className="py-2 pr-4 tabular-nums text-indigo-600 font-semibold dark:text-indigo-400">
                  {formatPace(split.paceMinPerKm)}
                </td>
                <td className="py-2 pr-4 tabular-nums">
                  {formatDuration(split.durationSec / 3600)}
                </td>
                <td className="py-2 pr-4 tabular-nums text-zinc-500 dark:text-zinc-400">
                  {formatDuration(split.elapsedSec / 3600)}
                </td>
                {hasHr && (
                  <td className="py-2 pr-4 tabular-nums">
                    {split.avgHr !== null ? `${Math.round(split.avgHr)} bpm` : "—"}
                  </td>
                )}
                {hasPower && (
                  <td className="py-2 tabular-nums">
                    {split.avgPower !== null ? `${Math.round(split.avgPower)} W` : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-100 px-4 py-3 dark:bg-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
