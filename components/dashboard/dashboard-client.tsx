"use client";

import dynamic from "next/dynamic";

import type { WorkoutAnalytics } from "@/lib/garmin/types";

const WorkoutDashboard = dynamic(
  () => import("@/components/dashboard/workout-dashboard").then((mod) => mod.WorkoutDashboard),
  { ssr: false },
);

export function DashboardClient({ analytics, isLoggedIn }: { analytics: WorkoutAnalytics; isLoggedIn?: boolean }) {
  return <WorkoutDashboard analytics={analytics} isLoggedIn={isLoggedIn} />;
}
