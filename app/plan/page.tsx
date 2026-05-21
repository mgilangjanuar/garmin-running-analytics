import { PlanPageClient } from "@/components/plan/plan-page-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { getWorkoutAnalytics } from "@/lib/garmin/parser";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const isLoggedIn = await getSession();
  if (!isLoggedIn) {
    redirect("/login");
  }

  const analytics = await getWorkoutAnalytics();
  const latestReadiness = analytics.trends.readiness.at(-1);
  const latestVo2 = analytics.trends.vo2Max.at(-1);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl">Plan Your Next Goal</CardTitle>
          <CardDescription>
            Generate a long-term periodized training plan from your Garmin data. Save plans, load them anytime, and upload workouts directly to Garmin.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">Sessions: {analytics.totals.activities}</Badge>
          <Badge variant="secondary">Distance: {analytics.totals.distanceKm.toFixed(1)} km</Badge>
          <Badge variant="secondary">
            Readiness: {latestReadiness ? `${latestReadiness.score} (${latestReadiness.level})` : "N/A"}
          </Badge>
          <Badge variant="secondary">VO2 max: {latestVo2?.vo2Max ?? "N/A"}</Badge>
        </CardContent>
      </Card>

      <PlanPageClient
        contextSummary={{
          currentReadiness: latestReadiness ? `${latestReadiness.score}` : "N/A",
          currentVo2: latestVo2 ? `${latestVo2.vo2Max}` : "N/A",
          totalSessions: analytics.totals.activities,
          totalDistanceKm: analytics.totals.distanceKm,
        }}
      />
    </main>
  );
}
