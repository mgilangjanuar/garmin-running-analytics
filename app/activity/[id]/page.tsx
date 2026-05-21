import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ActivityDetailCharts } from "@/components/activity/activity-detail-charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDateLabel,
  formatDistanceKm,
  formatDuration,
  formatNumber,
  formatPace,
  formatSport,
} from "@/lib/garmin/format";
import { getSession } from "@/lib/auth";
import { getWorkoutAnalytics } from "@/lib/garmin/parser";

export const dynamic = "force-dynamic";

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const isLoggedIn = await getSession();
  if (!isLoggedIn) {
    redirect("/login");
  }

  const { id } = await params;
  const activityId = Number(id);
  if (!Number.isFinite(activityId)) notFound();

  const analytics = await getWorkoutAnalytics();
  const activity = analytics.activities.all.find((item) => item.id === activityId);
  if (!activity) notFound();

  const relatedActivities = analytics.activities.all
    .filter((item) => item.sport === activity.sport && item.id !== activity.id)
    .slice(-5)
    .reverse();

  const cadencePerMin =
    activity.steps !== null && activity.durationHours > 0
      ? Math.round(activity.steps / (activity.durationHours * 60) / 2)
      : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6">
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Link href="/" className="hover:text-zinc-900 dark:hover:text-zinc-100">
          Dashboard
        </Link>
        <span>/</span>
        <span>{activity.name}</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{activity.name}</CardTitle>
          <CardDescription>
            {formatDateLabel(activity.startTime)} · {formatSport(activity.sport)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Distance" value={formatDistanceKm(activity.distanceKm)} highlight />
            <Metric label="Duration" value={formatDuration(activity.durationHours)} highlight />
            <Metric label="Avg Pace" value={formatPace(activity.paceMinPerKm)} highlight />
            <Metric
              label="Avg HR"
              value={activity.avgHr !== null ? `${Math.round(activity.avgHr)} bpm` : "N/A"}
              highlight
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Max HR"
              value={activity.maxHr !== null ? `${Math.round(activity.maxHr)} bpm` : "N/A"}
            />
            <Metric
              label="Avg Power"
              value={activity.avgPower !== null ? `${Math.round(activity.avgPower)} W` : "N/A"}
            />
            <Metric
              label="Training Load"
              value={
                activity.trainingLoad !== null
                  ? formatNumber(Math.round(activity.trainingLoad), 0)
                  : "N/A"
              }
            />
            <Metric
              label="Calories"
              value={
                activity.calories !== null
                  ? `${formatNumber(Math.round(activity.calories), 0)} kcal`
                  : "N/A"
              }
            />
          </div>
          {(activity.steps !== null || cadencePerMin !== null) && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {activity.steps !== null && (
                <Metric
                  label="Total Steps"
                  value={formatNumber(activity.steps, 0)}
                />
              )}
              {cadencePerMin !== null && (
                <Metric label="Avg Cadence" value={`${cadencePerMin} spm`} />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ActivityDetailCharts splits={activity.splits} activity={activity} />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Relevant Training Context</CardTitle>
            <CardDescription>Current thresholds and latest readiness signals</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                LTHR: {analytics.thresholds.lactateThresholdHeartRate ?? "N/A"} bpm
              </Badge>
              <Badge variant="secondary">
                FTP: {analytics.thresholds.functionalThresholdPower ?? "N/A"} W
              </Badge>
              <Badge variant="secondary">
                Readiness: {analytics.trends.readiness.at(-1)?.score ?? "N/A"}
              </Badge>
            </div>
            <p className="text-zinc-600">
              Use this page as a single-session anchor before planning your next block in{" "}
              <Link href="/plan" className="text-indigo-600 underline underline-offset-2">
                /plan
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Related {formatSport(activity.sport)} Sessions</CardTitle>
            <CardDescription>Most recent sessions in the same sport type</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {relatedActivities.length === 0 ? (
              <p className="text-sm text-zinc-500">No related sessions found.</p>
            ) : (
              relatedActivities.map((item) => (
                <Link
                  key={`${item.id}-${item.startTime}`}
                  href={`/activity/${item.id}`}
                  className="block rounded-md border border-zinc-200 p-3 text-sm hover:bg-zinc-100/60 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                >
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-zinc-500">
                    {formatDateLabel(item.startTime)} · {formatDistanceKm(item.distanceKm)} ·{" "}
                    {formatDuration(item.durationHours)} · {formatPace(item.paceMinPerKm)}
                  </p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"}`}>
      <p className={`text-xs ${highlight ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-500 dark:text-zinc-400"}`}>{label}</p>
      <p className={`text-sm font-semibold ${highlight ? "text-white dark:text-zinc-900" : "text-zinc-900 dark:text-zinc-100"}`}>{value}</p>
    </div>
  );
}
