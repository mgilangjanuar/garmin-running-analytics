import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { GarminSyncForm } from "@/components/dashboard/garmin-sync-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkoutAnalytics } from "@/lib/garmin/parser";
import { getSession } from "@/lib/auth";
import type { WorkoutAnalytics } from "@/lib/garmin/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const isLoggedIn = await getSession();
  let analytics: WorkoutAnalytics | null = null;
  let dataError: string | null = null;

  try {
    analytics = await getWorkoutAnalytics();
  } catch (err) {
    dataError = err instanceof Error ? err.message : String(err);
  }

  if (!analytics) {
    return (
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6">
        {isLoggedIn && <GarminSyncForm />}
        <Card>
          <CardHeader>
            <CardTitle>{isLoggedIn ? "No data yet" : "Welcome"}</CardTitle>
            <CardDescription>
              {isLoggedIn
                ? dataError
                  ? `Could not load data: ${dataError}`
                  : "Click \"Sync from Garmin\" above to fetch your latest Garmin Connect data."
                : "Log in to sync your Garmin data, access latest activities, and use the planning assistant."}
            </CardDescription>
          </CardHeader>
          {!isLoggedIn && (
            <CardContent>
              <a href="/login" className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 dark:hover:bg-indigo-500">
                Log In
              </a>
            </CardContent>
          )}
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6">
      {isLoggedIn && <GarminSyncForm />}

      <DashboardClient analytics={analytics} isLoggedIn={isLoggedIn} />
    </main>
  );
}
