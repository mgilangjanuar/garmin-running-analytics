import type { WorkoutAnalytics } from "@/lib/garmin/types";

export function buildAiWorkoutContext(analytics: WorkoutAnalytics) {
  const recentActivities = analytics.activities.latest.slice(0, 8).map((activity) => ({
    date: activity.startTime.slice(0, 10),
    sport: activity.sport,
    name: activity.name,
    distanceKm: activity.distanceKm,
    durationHours: activity.durationHours,
    trainingLoad: activity.trainingLoad ?? 0,
  }));

  const latestReadiness = analytics.trends.readiness.at(-1);
  const latestAcwr = analytics.trends.acuteLoad.at(-1);
  const latestSleep = analytics.trends.sleep.at(-1);
  const latestVo2 = analytics.trends.vo2Max.at(-1);
  const latestRacePrediction = analytics.trends.racePrediction.at(-1);

  return {
    period: analytics.period,
    totals: analytics.totals,
    distribution: analytics.sportDistribution,
    thresholds: analytics.thresholds,
    heartRateZones: analytics.zones.heartRate,
    powerZones: analytics.zones.power,
    latestSignals: {
      readiness: latestReadiness ?? null,
      acwr: latestAcwr ?? null,
      sleep: latestSleep ?? null,
      vo2: latestVo2 ?? null,
      racePrediction: latestRacePrediction ?? null,
    },
    recentActivities,
    personalRecords: analytics.personalRecords,
    keyInsights: analytics.insights,
  };
}
